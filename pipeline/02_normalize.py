"""Stage 2: turn the raw downloads into canonical tables with declared grains.

Tables produced, all in build/:

  event_rows   one NOAA event: one hazard type, one place, one time window
  events       one weather system, the site's unit of exploration
  stations     weather stations and tide gauges
  weather      one station, one day, one measure
  tracks       one storm, one six-hour best-track position
  assistance   one FEMA disaster, one programme, one county
  nfip         one flood insurance claim
  cpi          one year, one index value

Two rules govern everything here.

Join on codes, never on names. NOAA writes the same marine zone as both
"NEW YORK HARBOR" and "New York Harbor" in different years, and a name join
would silently drop half the record.

A value is always a status and a number, never a bare number. Nothing in this
file may write a zero to stand for an absence.
"""

import csv
import gzip
import hashlib
import importlib
import io
import json
import os
import re
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
cfg = importlib.import_module("00_config")


# ---------------------------------------------------------------------------
# The value model
# ---------------------------------------------------------------------------

def measure(value, status, unit="", source=None, note=None):
    """Every number the site displays passes through here.

    A status is compulsory. There is no default, because the whole class of bug
    this project exists to fix comes from a missing value picking up a default.
    """
    if status == cfg.STATUS_OK and value is None:
        raise ValueError("a measure cannot be ok and hold no value")
    if status != cfg.STATUS_OK and value is not None:
        # A censored value carries its bound, everything else carries nothing.
        if status != cfg.STATUS_CENSORED:
            raise ValueError(f"a {status} measure must not carry a value")
    m = {"v": value, "s": status}
    if unit:
        m["u"] = unit
    if source:
        m["src"] = source
    if note:
        m["n"] = note
    return m


def ok(value, unit="", source=None, note=None):
    return measure(value, cfg.STATUS_OK, unit, source, note)


def missing(unit="", source=None, note=None):
    return measure(None, cfg.STATUS_MISSING, unit, source, note)


def na(unit="", source=None, note=None):
    return measure(None, cfg.STATUS_NA, unit, source, note)


def sum_measures(values, unit="", source=None):
    """Sum only where something was reported, and say which state the result is
    in. A sum over nothing is not zero."""
    real = [m for m in values if m["s"] == cfg.STATUS_OK]
    if not real:
        if values and all(m["s"] == cfg.STATUS_NA for m in values):
            return na(unit, source)
        return missing(unit, source)
    total = sum(m["v"] for m in real)
    note = None
    if len(real) < len(values):
        note = f"{len(real)} of {len(values)} parts reported"
    return ok(total, unit, source, note)


def log(msg):
    print(f"  {msg}", flush=True)


# ---------------------------------------------------------------------------
# Storm Events
# ---------------------------------------------------------------------------

def parse_damage(text):
    """NOAA writes damage as 19.00B, 250K, 0.00K or blank. Blank is missing,
    not zero, and 0.00K is a reported zero, which is a different thing."""
    if text is None or text.strip() == "":
        return missing("$", "ncei-storm-events")
    m = re.match(r"^([\d.]+)\s*([KMBkmbHh]?)$", text.strip())
    if not m:
        raise ValueError(f"unparsable damage value {text!r}")
    scale = {"": 1, "H": 1e2, "K": 1e3, "M": 1e6, "B": 1e9}[m.group(2).upper()]
    return ok(round(float(m.group(1)) * scale), "$", "ncei-storm-events")


def parse_int(text, unit="", source=None):
    if text is None or text.strip() == "":
        return missing(unit, source)
    return ok(int(float(text)), unit, source)


def stamp(yearmonth, day, time_hhmm):
    """Build a timestamp from the unambiguous integer fields rather than from
    BEGIN_DATE_TIME, whose two-digit year cannot be read safely across 1958 to
    2026."""
    y, mth = int(yearmonth[:4]), int(yearmonth[4:6])
    t = time_hhmm.zfill(4)
    hh, mm = int(t[:2]), int(t[2:])
    if hh == 24:  # NOAA writes midnight as 2400 in some years
        hh, mm = 23, 59
    return datetime(y, mth, int(day), hh, min(mm, 59))


def load_storm_events():
    rows = []
    unmapped = set()
    files = sorted((cfg.RAW / "storm-events").glob("*.csv.gz"))
    if not files:
        raise SystemExit("No storm event files. Run stage 1 first.")
    for path in files:
        # The archive is mostly ASCII, but some narratives carry Windows-1252
        # punctuation: a curly apostrophe in a 2012 narrative arrives as a byte
        # that is not valid UTF-8. Replacing it would print a black diamond in
        # the middle of the Weather Service's own words, so the file is decoded
        # strictly first and only falls back where that fails.
        raw = gzip.open(path, "rb").read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("cp1252")
        with io.StringIO(text) as fh:
            for r in csv.DictReader(fh):
                key = (r["CZ_TYPE"], r["CZ_FIPS"].zfill(3))
                borough = cfg.NCEI_GEOGRAPHY.get(key)
                marine = key in cfg.NCEI_MARINE and "ATLANTIC" in r.get("STATE", "")
                if borough is None and not marine:
                    continue
                if borough is not None and r.get("STATE") != "NEW YORK":
                    continue
                hazard = cfg.NCEI_EVENT_TYPE_TO_HAZARD.get(r["EVENT_TYPE"])
                if hazard is None:
                    unmapped.add(r["EVENT_TYPE"])
                    continue
                begin = stamp(r["BEGIN_YEARMONTH"], r["BEGIN_DAY"], r["BEGIN_TIME"])
                end = stamp(r["END_YEARMONTH"], r["END_DAY"], r["END_TIME"])
                if end < begin:
                    # Preserve the published value and flag it rather than
                    # repairing it. Two rows in the archive have this.
                    note = "source end time precedes start time"
                    end = begin
                else:
                    note = None
                rows.append({
                    "event_row_id": r["EVENT_ID"],
                    # Where the source publishes no episode, which is most of
                    # the record before 1996, rows that share a hazard and an
                    # identical window are one weather system. The Blizzard of
                    # 1996 arrived as fourteen separate events under the old
                    # rule of one row, one event, and its federal declaration
                    # was attached to all fourteen. The match is exact, not a
                    # tolerance, so nothing is grouped that the source did not
                    # already publish as the same window.
                    #
                    # The key is a short digest rather than the values
                    # themselves, because an event identifier is public: it goes
                    # in the URL, in the downloads and in anything anyone cites.
                    # A timestamp written into an identifier puts colons in a
                    # file name and in a query string, which breaks on Windows
                    # and needs escaping everywhere else.
                    "episode_id": r["EPISODE_ID"] or (
                        cfg.SYNTHETIC_EPISODE_PREFIX + hashlib.sha1(
                            f"{hazard}|{begin}|{end}".encode()
                        ).hexdigest()[:8]),
                    "episode_declared": bool(r["EPISODE_ID"]),
                    "hazard": hazard,
                    "ncei_type": r["EVENT_TYPE"],
                    "place": borough or "HARBOR",
                    "cz_type": r["CZ_TYPE"],
                    "cz_fips": r["CZ_FIPS"].zfill(3),
                    "begin": begin.isoformat(sep=" "),
                    "end": end.isoformat(sep=" "),
                    "tz": r.get("CZ_TIMEZONE", ""),
                    "deaths_direct": parse_int(r["DEATHS_DIRECT"], "", "ncei-storm-events"),
                    "deaths_indirect": parse_int(r["DEATHS_INDIRECT"], "", "ncei-storm-events"),
                    "injuries_direct": parse_int(r["INJURIES_DIRECT"], "", "ncei-storm-events"),
                    "injuries_indirect": parse_int(r["INJURIES_INDIRECT"], "", "ncei-storm-events"),
                    "damage_property": parse_damage(r["DAMAGE_PROPERTY"]),
                    "damage_crops": parse_damage(r["DAMAGE_CROPS"]),
                    "magnitude": r.get("MAGNITUDE") or None,
                    "magnitude_type": r.get("MAGNITUDE_TYPE") or None,
                    "flood_cause": r.get("FLOOD_CAUSE") or None,
                    "tor_scale": r.get("TOR_F_SCALE") or None,
                    "lat": float(r["BEGIN_LAT"]) if r.get("BEGIN_LAT") else None,
                    "lon": float(r["BEGIN_LON"]) if r.get("BEGIN_LON") else None,
                    "report_source": r.get("SOURCE") or None,
                    "episode_narrative": (r.get("EPISODE_NARRATIVE") or "").strip(),
                    "event_narrative": (r.get("EVENT_NARRATIVE") or "").strip(),
                    "note": note,
                })
    if unmapped:
        raise SystemExit(
            "These NOAA event types have no hazard mapping:\n  "
            + "\n  ".join(sorted(unmapped))
            + "\nAdd them to NCEI_EVENT_TYPE_TO_HAZARD in pipeline/00_config.py. "
            "They are not dropped into an 'other' bucket on purpose: an "
            "unmapped type is a decision, not a default."
        )
    log(f"{len(rows)} event rows across {len(files)} yearly files")
    return rows


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

def build_events(rows):
    """An event is a NOAA episode, except where a merge is declared.

    See research/profile-storm-events.md for why merging by time alone was
    rejected: it produced 982 events at zero tolerance and 614 at six hours,
    which is too sensitive a hinge for the site's primary unit.
    """
    merge_of = {}
    for m in cfg.EVENT_MERGES:
        for ep in m["episodes"]:
            merge_of[ep] = m

    groups = {}
    for r in rows:
        m = merge_of.get(r["episode_id"])
        key = m["id"] if m else r["episode_id"]
        groups.setdefault(key, []).append(r)

    events = []
    for key, members in groups.items():
        members.sort(key=lambda r: r["begin"])
        begin = min(r["begin"] for r in members)
        end = max(r["end"] for r in members)
        declared = next((m for m in cfg.EVENT_MERGES if m["id"] == key), None)

        if declared:
            event_id, name, merged = declared["id"], declared["name"], True
        else:
            event_id = "E" + begin[:10].replace("-", "") + "-" + key
            name, merged = None, False

        hazards = []
        for r in members:
            if r["hazard"] not in hazards:
                hazards.append(r["hazard"])
        places = [p for p in cfg.BOROUGH_ORDER
                  if any(r["place"] == p for r in members)]
        harbor = any(r["place"] == "HARBOR" for r in members)

        # Narratives are NOAA's words. The episode narrative describes the
        # weather system, so one is kept per event; event narratives are kept
        # per row and shown as evidence.
        narrative = next((r["episode_narrative"] for r in members
                          if r["episode_narrative"]), "")

        # NOAA's own file carries U+FFFD in some narratives, where a curly
        # apostrophe was lost in a transcode upstream. Sandy's narrative has
        # three. The text is published as it arrived and the damage is flagged,
        # because quietly substituting an apostrophe would be repairing a source
        # value, and the same reflex is what turns an absent measure into a zero.
        damaged = narrative.count("�")

        events.append({
            "event_id": event_id,
            "name": name,
            "merged": merged,
            "episodes": sorted({r["episode_id"] for r in members}),
            "episode_declared": all(r["episode_declared"] for r in members),
            "begin": begin,
            "end": end,
            "year": int(begin[:4]),
            "hazards": hazards,
            "places": places,
            "harbor": harbor,
            "narrative": narrative,
            "narrative_damaged": damaged,
            "rows": [r["event_row_id"] for r in members],
            "deaths_direct": sum_measures([r["deaths_direct"] for r in members],
                                          "", "ncei-storm-events"),
            "deaths_indirect": sum_measures([r["deaths_indirect"] for r in members],
                                            "", "ncei-storm-events"),
            "injuries_direct": sum_measures([r["injuries_direct"] for r in members],
                                            "", "ncei-storm-events"),
            "damage_property": sum_measures([r["damage_property"] for r in members],
                                            "$", "ncei-storm-events"),
            "damage_crops": sum_measures([r["damage_crops"] for r in members],
                                         "$", "ncei-storm-events"),
        })
    events.sort(key=lambda e: e["begin"])
    log(f"{len(events)} events, {sum(1 for e in events if e['merged'])} merged by hand")
    return events


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------

CONVERT = {
    "tenths_c_to_f": lambda v: round(v / 10 * 9 / 5 + 32, 1),
    "tenths_mm_to_in": lambda v: round(v / 10 / 25.4, 2),
    "mm_to_in": lambda v: round(v / 25.4, 1),
    "tenths_ms_to_mph": lambda v: round(v / 10 * 2.236936, 1),
}


def load_weather():
    """GHCN daily, one row per station per day per measure.

    Units are converted here and nowhere else, through the named transformations
    in the config, so a reader can check any displayed value against the source
    by reversing one function.
    """
    out = {}
    for sid, meta in cfg.WEATHER_STATIONS.items():
        path = cfg.RAW / "ghcn" / f"{sid}.csv"
        if not path.exists():
            log(f"weather: {sid} not fetched, skipping")
            continue
        n = 0
        with open(path, newline="", encoding="utf-8", errors="replace") as fh:
            reader = csv.DictReader(fh)
            fields = {f.upper(): f for f in reader.fieldnames or []}
            for r in reader:
                date = (r.get(fields.get("DATE", "DATE")) or "")[:10]
                if not date:
                    continue
                day = out.setdefault(date, {})
                for elem, spec in cfg.GHCN_ELEMENTS.items():
                    col = fields.get(elem)
                    raw = r.get(col) if col else None
                    if raw is None or raw == "":
                        continue
                    try:
                        value = CONVERT[spec["convert"]](float(raw))
                    except ValueError:
                        continue
                    day.setdefault(spec["measure"], {})[sid] = value
                    n += 1
        log(f"weather: {meta['name']}, {n} readings")
    return out


def event_weather(event, weather):
    """Peaks across the event window, with the station that produced each one.

    A peak is a derived value. The window is inclusive of both end days because
    an event that begins at 23:00 draws on the following day's totals.
    """
    d0 = datetime.fromisoformat(event["begin"]).date()
    d1 = datetime.fromisoformat(event["end"]).date()
    days = []
    d = d0
    while d <= d1 and len(days) < 40:
        days.append(d.isoformat())
        d += timedelta(days=1)

    result = {}
    reporting = set()
    for measure_name in ("temp_max", "temp_min", "rain_daily", "snow_daily",
                         "wind_2min", "wind_avg"):
        best = None
        for day in days:
            for sid, value in weather.get(day, {}).get(measure_name, {}).items():
                reporting.add(sid)
                if best is None:
                    best = (value, sid, day)
                elif measure_name == "temp_min":
                    if value < best[0]:
                        best = (value, sid, day)
                elif value > best[0]:
                    best = (value, sid, day)
        unit = next(s["unit"] for e, s in cfg.GHCN_ELEMENTS.items()
                    if s["measure"] == measure_name)
        if best is None:
            status_fn = na if d1.year < 1900 else missing
            result[measure_name] = status_fn(unit, "ghcn-daily")
        else:
            result[measure_name] = ok(
                best[0], unit, "ghcn-daily",
                f"{cfg.WEATHER_STATIONS[best[1]]['name']}, {best[2]}")

    for measure_name, source_measure in (("rain_total", "rain_daily"),
                                         ("snow_total", "snow_daily")):
        # Event total is the sum over the window at the wettest single station,
        # not a sum across stations, which would count the same storm four times.
        unit = "in"
        totals, reported = {}, {}
        for day in days:
            for sid, value in weather.get(day, {}).get(source_measure, {}).items():
                totals[sid] = totals.get(sid, 0) + value
                reported[sid] = reported.get(sid, 0) + 1
        if not totals:
            result[measure_name] = missing(unit, "ghcn-daily")
        else:
            sid = max(totals, key=totals.get)
            # The note counts the days that station actually reported, not the
            # length of the window. A four-day storm summed from two reported
            # days is a partial total and has to say so.
            have, want = reported[sid], len(days)
            span = (f"{have} of {want} days reported" if have < want
                    else f"all {want} day{'s' if want != 1 else ''} of the window")
            result[measure_name] = ok(
                round(totals[sid], 2), unit, "ghcn-daily",
                f"{cfg.WEATHER_STATIONS[sid]['name']}, {span}")
    result["_stations"] = sorted(reporting)
    result["_days"] = days
    return result


# ---------------------------------------------------------------------------
# Storm tracks
# ---------------------------------------------------------------------------

def load_tracks():
    """HURDAT2 is a header line per storm followed by its track points. Only
    storms passing near New York are kept, on a generous box, because a track
    that misses the city can still be the reason for an event here."""
    path = cfg.RAW / "hurdat2.txt"
    if not path.exists():
        log("tracks: hurdat2 not fetched, skipping")
        return {}
    box = (37.0, 44.0, -78.0, -68.0)
    tracks, current, points = {}, None, []

    def keep():
        if current and points:
            if any(box[0] <= p["lat"] <= box[1] and box[2] <= p["lon"] <= box[3]
                   for p in points):
                tracks[current["id"]] = {**current, "points": points}

    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        parts = [p.strip() for p in line.split(",")]
        if parts and re.match(r"^AL\d{6}$", parts[0]):
            keep()
            current = {"id": parts[0], "name": parts[1].title(),
                       "year": int(parts[0][4:])}
            points = []
        elif current and len(parts) > 7 and re.match(r"^\d{8}$", parts[0]):
            lat = float(parts[4][:-1]) * (1 if parts[4][-1] == "N" else -1)
            lon = float(parts[5][:-1]) * (-1 if parts[5][-1] == "W" else 1)
            points.append({
                "t": f"{parts[0][:4]}-{parts[0][4:6]}-{parts[0][6:8]} "
                     f"{parts[1][:2]}:{parts[1][2:]}",
                "status": parts[3],
                "lat": round(lat, 2), "lon": round(lon, 2),
                "wind": int(parts[6]) if parts[6] not in ("", "-99") else None,
                "pressure": int(parts[7]) if parts[7] not in ("", "-999") else None,
            })
    keep()
    log(f"tracks: {len(tracks)} storms passing near New York")
    return tracks


def match_track(event, tracks):
    """A track belongs to an event if any of its points falls inside the event
    window. Matching on name would fail for every unnamed system."""
    b = datetime.fromisoformat(event["begin"]) - timedelta(hours=24)
    e = datetime.fromisoformat(event["end"]) + timedelta(hours=24)
    hits = []
    for tid, t in tracks.items():
        if t["year"] < b.year - 1 or t["year"] > e.year + 1:
            continue
        inside = [p for p in t["points"]
                  if b <= datetime.fromisoformat(p["t"]) <= e]
        if inside:
            hits.append({"id": tid, "name": t["name"], "points": t["points"]})
    return hits


# ---------------------------------------------------------------------------
# FEMA
# ---------------------------------------------------------------------------

def load_fema():
    out = {}
    for name in ("declarations", "public-assistance", "nfip-claims",
                 "ia-owners", "ia-renters"):
        path = cfg.RAW / "fema" / f"{name}.json"
        out[name] = json.loads(path.read_text()) if path.exists() else []
        log(f"fema {name}: {len(out[name])} rows")
    return out


def normalize_cpi():
    path = cfg.RAW / "cpi.json"
    if not path.exists():
        log("cpi: not fetched")
        return {}
    return json.loads(path.read_text()).get("annual", {})


# ---------------------------------------------------------------------------

def main():
    cfg.BUILD.mkdir(parents=True, exist_ok=True)
    print("[normalize] storm events", flush=True)
    rows = load_storm_events()
    events = build_events(rows)

    print("[normalize] weather", flush=True)
    weather = load_weather()
    for e in events:
        e["weather"] = event_weather(e, weather)

    print("[normalize] tracks", flush=True)
    tracks = load_tracks()
    # Every event is offered a track, not only those NOAA typed as tropical.
    # Sandy is filed as coastal flooding and high wind, so a hazard-type gate
    # would have hidden the storm track from the one event that most needs it.
    # The real test is whether a best-track position falls near New York inside
    # the event window, which is what match_track does.
    for e in events:
        e["tracks"] = match_track(e, tracks)

    print("[normalize] federal assistance", flush=True)
    fema = load_fema()
    cpi = normalize_cpi()

    write = lambda name, obj: (cfg.BUILD / name).write_text(
        json.dumps(obj, separators=(",", ":")))
    write("event_rows.json", rows)
    write("events.json", events)
    write("weather.json", weather)
    write("fema.json", fema)
    write("cpi.json", cpi)
    print(f"[normalize] {len(events)} events, {len(rows)} rows", flush=True)


if __name__ == "__main__":
    main()
