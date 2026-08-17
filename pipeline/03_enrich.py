"""Stage 3: attach consequences, water levels and federal assistance to events.

This stage is separate from normalize because it is the only one that goes back
to the network after the event list exists, and because it is the slow one.

The consequence queries are written as aggregates, not row fetches. Asking
311 for a daily count by borough returns about thirty thousand rows for a whole
family across the whole record, where fetching the rows themselves would mean
handling twenty-two million. One query per family per dataset, twenty-four in
total, instead of one per event.

Every dataset here starts later than the event record. A consequence that could
not have been recorded is marked not applicable, never zero. That distinction is
the point of the whole project.
"""

import importlib
import json
import os
import sys
import urllib.parse
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
cfg = importlib.import_module("00_config")
fetch = importlib.import_module("01_fetch")
norm = importlib.import_module("02_normalize")

ok, missing, na, measure = norm.ok, norm.missing, norm.na, norm.measure
log = norm.log

CACHE = cfg.RAW / "enrich"


def cached(name, builder):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text())
    value = builder()
    path.write_text(json.dumps(value, separators=(",", ":")))
    return value


def soql(dataset, params, timeout=240):
    token = os.environ.get("NYC_APP_TOKEN")
    if token:
        params = dict(params, **{"$$app_token": token})
    url = (f"https://{cfg.SOCRATA_HOST}/resource/{dataset}.json?"
           + urllib.parse.urlencode(params))
    return json.loads(fetch.get(url, expect="json", timeout=timeout))


BOROUGH_FROM_311 = {
    "BRONX": "BX", "BROOKLYN": "BK", "MANHATTAN": "MN",
    "QUEENS": "QN", "STATEN ISLAND": "SI",
}


# ---------------------------------------------------------------------------
# 311
# ---------------------------------------------------------------------------

def fetch_311_family(family_key):
    """Daily complaint counts by borough for one complaint family.

    Matching is on complaint_type text because that is the only key 311 offers.
    The text changes between the dataset splits, so the config lists every
    spelling rather than one value, and a family that matches nothing in a given
    dataset is reported rather than passing silently.
    """
    family = cfg.COMPLAINT_FAMILIES[family_key]
    quoted = ",".join("'" + t.replace("'", "''") + "'" for t in family["types"])
    daily = {}
    today = datetime.now().year
    for ds in cfg.NYC_311_DATASETS:
        first = int(ds["from"][:4])
        last = min(int(ds["to"][:4]), today)
        hits = 0
        # A year at a time. Grouping the whole 22 million row dataset by day and
        # borough in one query times out; a single year does not.
        for year in range(first, last + 1):
            rows = soql(ds["id"], {
                "$select": "date_trunc_ymd(created_date) as d, borough, count(1) as n",
                "$where": (f"complaint_type in ({quoted}) and "
                           f"created_date >= '{year}-01-01T00:00:00' and "
                           f"created_date < '{year + 1}-01-01T00:00:00'"),
                "$group": "d, borough",
                "$limit": "50000",
            })
            for r in rows:
                if not r.get("d"):
                    continue
                day = r["d"][:10]
                boro = BOROUGH_FROM_311.get((r.get("borough") or "").upper())
                if boro is None:
                    continue
                bucket = daily.setdefault(day, {})
                bucket[boro] = bucket.get(boro, 0) + int(r["n"])
                hits += 1
        log(f"311 {family_key} in {ds['id']}: {hits} day-borough rows")
        if hits == 0:
            log(f"  warning: no rows matched in {ds['id']}. The complaint "
                f"vocabulary for this dataset may differ. Check "
                f"COMPLAINT_FAMILIES in pipeline/00_config.py.")
    return daily


def fetch_collisions():
    """Daily collision counts and casualties by borough."""
    daily = {}
    for year in range(int(cfg.COLLISIONS_START[:4]), datetime.now().year + 1):
        rows = soql(cfg.COLLISIONS_DATASET, {
            "$select": ("date_trunc_ymd(crash_date) as d, borough, count(1) as n, "
                        "sum(number_of_persons_injured) as inj, "
                        "sum(number_of_persons_killed) as kil"),
            "$where": (f"crash_date >= '{year}-01-01T00:00:00' and "
                       f"crash_date < '{year + 1}-01-01T00:00:00'"),
            "$group": "d, borough",
            "$limit": "50000",
        })
        for r in rows:
            if not r.get("d"):
                continue
            boro = BOROUGH_FROM_311.get((r.get("borough") or "").upper())
            if boro is None:
                continue
            day = daily.setdefault(r["d"][:10], {})
            day[boro] = {
                "n": int(r["n"]),
                "injured": int(float(r.get("inj") or 0)),
                "killed": int(float(r.get("kil") or 0)),
            }
    log(f"collisions: {len(daily)} days")
    return daily


def window_days(event, pad_days=1):
    """The days a consequence may be attributed to.

    The padding differs by dataset and is declared in CONSEQUENCE_WINDOWS, not
    chosen here, so the site can state the window it actually used rather than
    one blanket sentence covering datasets that do not share a rule.
    """
    d0 = datetime.fromisoformat(event["begin"]).date()
    d1 = datetime.fromisoformat(event["end"]).date() + timedelta(days=pad_days)
    days, d = [], d0
    while d <= d1 and len(days) < 45:
        days.append(d.isoformat())
        d += timedelta(days=1)
    return days


def sum_311(event, family_key, daily):
    """Counts for one family over the event window, by borough and in total."""
    family = cfg.COMPLAINT_FAMILIES[family_key]
    days = window_days(event, cfg.CONSEQUENCE_WINDOWS["nyc-311"]["pad_days"])
    if days[-1] < cfg.NYC_311_START:
        return {"total": na("", "nyc-311",
                            "311 records begin in 2004"),
                "by_borough": {}, "series": []}

    by_boro, series = {}, []
    found = False
    for day in days:
        counts = daily.get(day, {})
        if counts:
            found = True
        series.append({"d": day, "n": sum(counts.values())})
        for boro, n in counts.items():
            by_boro[boro] = by_boro.get(boro, 0) + n

    total = sum(by_boro.values())
    if not found:
        # The dataset covers this window and reported nothing, which is a real
        # zero rather than an absence.
        return {"total": ok(0, "", "nyc-311", "no complaints in this window"),
                "by_borough": {}, "series": series, "label": family["label"]}
    return {
        "total": ok(total, "", "nyc-311"),
        "by_borough": {b: ok(n, "", "nyc-311") for b, n in by_boro.items()},
        "series": series,
        "label": family["label"],
    }


def sum_collisions(event, daily):
    days = window_days(
        event, cfg.CONSEQUENCE_WINDOWS["nyc-collisions"]["pad_days"])
    if days[-1] < cfg.COLLISIONS_START:
        note = "collision records begin in July 2012"
        return {"total": na("", "nyc-collisions", note),
                "injured": na("", "nyc-collisions", note),
                "killed": na("", "nyc-collisions", note),
                "by_borough": {}, "series": []}
    by_boro, series = {}, []
    n = inj = kil = 0
    for day in days:
        counts = daily.get(day, {})
        dn = sum(c["n"] for c in counts.values())
        series.append({"d": day, "n": dn})
        n += dn
        inj += sum(c["injured"] for c in counts.values())
        kil += sum(c["killed"] for c in counts.values())
        for boro, c in counts.items():
            by_boro[boro] = by_boro.get(boro, 0) + c["n"]
    return {
        "total": ok(n, "", "nyc-collisions"),
        "injured": ok(inj, "", "nyc-collisions"),
        "killed": ok(kil, "", "nyc-collisions"),
        "by_borough": {b: ok(v, "", "nyc-collisions") for b, v in by_boro.items()},
        "series": series,
    }


# ---------------------------------------------------------------------------
# Water levels
# ---------------------------------------------------------------------------

def coops(station, product, begin, end, interval=None):
    params = {
        "product": product, "application": "NYCHazardHistorian",
        "begin_date": begin, "end_date": end, "datum": cfg.TIDE_DATUM,
        "station": station, "time_zone": "gmt", "units": cfg.TIDE_UNITS,
        "format": "json",
    }
    if interval:
        params["interval"] = interval
    url = ("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?"
           + urllib.parse.urlencode(params))
    payload = json.loads(fetch.get(url, expect="json"))
    if "error" in payload:
        return None
    return payload.get("data") or payload.get("predictions")


def event_tides(event, station="8518750"):
    """Observed water level and predicted tide over the event window.

    Surge is the difference between them. It is derived by this project, so it
    is labeled as derived wherever it appears. The six-minute product does not
    reach the early record, so the hourly product is used as a fallback and the
    interval is recorded with the values.
    """
    hazards = set(event["hazards"])
    if not hazards & cfg.TIDE_HAZARDS:
        return None
    b = datetime.fromisoformat(event["begin"]) - timedelta(hours=6)
    e = datetime.fromisoformat(event["end"]) + timedelta(hours=6)
    if (e - b) > timedelta(days=8):
        e = b + timedelta(days=8)
    fmt = "%Y%m%d %H:%M"
    begin_s, end_s = b.strftime(fmt), e.strftime(fmt)

    observed = coops(station, "water_level", begin_s, end_s)
    interval = "6 minutes"
    if not observed:
        observed = coops(station, "hourly_height", begin_s, end_s)
        interval = "1 hour"
    if not observed:
        return {"status": "missing"}
    predicted = coops(station, "predictions", begin_s, end_s,
                      interval="h" if interval == "1 hour" else None)

    obs = [(r["t"], float(r["v"])) for r in observed if r.get("v") not in ("", None)]
    if not obs:
        return {"status": "missing"}
    pred = {r["t"]: float(r["v"]) for r in (predicted or [])
            if r.get("v") not in ("", None)}

    peak_t, peak_v = max(obs, key=lambda x: x[1])
    surge = [(t, round(v - pred[t], 2)) for t, v in obs if t in pred]
    result = {
        "status": "ok",
        "station": station,
        "station_name": cfg.TIDE_STATIONS[station]["name"],
        "datum": cfg.TIDE_DATUM,
        "interval": interval,
        "peak_level": {"v": round(peak_v, 2), "t": peak_t},
        "series": [{"t": t, "o": round(v, 2), "p": pred.get(t)}
                   for t, v in obs[::max(1, len(obs) // 240)]],
    }
    if surge:
        st, sv = max(surge, key=lambda x: x[1])
        result["peak_surge"] = {"v": sv, "t": st}
    return result


# ---------------------------------------------------------------------------
# Federal assistance
# ---------------------------------------------------------------------------

def index_fema(fema):
    """Group the FEMA rows by disaster number once, rather than per event."""
    pa, ia_o, ia_r = {}, {}, {}
    for r in fema["public-assistance"]:
        d = str(r.get("disasterNumber"))
        v = r.get("federalShareObligated")
        if v is None:
            continue
        e = pa.setdefault(d, {"federal": 0.0, "projects": 0, "by_category": {},
                              "by_applicant": {}})
        e["federal"] += float(v)
        e["projects"] += 1
        cat = r.get("damageCategoryDescrip") or "Not stated"
        e["by_category"][cat] = e["by_category"].get(cat, 0.0) + float(v)
        app = r.get("applicationTitle") or "Not stated"
        e["by_applicant"][app] = e["by_applicant"].get(app, 0.0) + float(v)

    for rows, out, key in ((fema["ia-owners"], ia_o, "owners"),
                           (fema["ia-renters"], ia_r, "renters")):
        for r in rows:
            if r.get("zipCode") and not str(r["zipCode"]).startswith(
                    ("100", "101", "102", "103", "104", "110", "111", "112",
                     "113", "114", "116")):
                continue  # New York City ZIP prefixes
            d = str(r.get("disasterNumber"))
            e = out.setdefault(d, {"approved": 0.0, "applicants": 0})
            for field in ("totalApprovedIhpAmount", "approvedForFemaAssistance"):
                if r.get(field) is not None:
                    e["approved"] += float(r[field])
                    break
            e["applicants"] += int(r.get("validRegistrations") or 0)
    return {"pa": pa, "ia_owners": ia_o, "ia_renters": ia_r}


def match_disasters(event, declarations):
    """A disaster belongs to an event if their incident periods overlap, the
    declaration is for weather, and its incident period is short enough to be
    about one storm.

    Overlap alone is not enough. The COVID-19 declarations run from January 2020
    to May 2023 and would otherwise attach their assistance to every storm in
    three years. See FEMA_INCIDENT_TYPES in the config.

    Declaration numbers are the join key, never the disaster name.
    """
    b = datetime.fromisoformat(event["begin"]).date()
    e = datetime.fromisoformat(event["end"]).date()
    pad = timedelta(days=cfg.FEMA_INCIDENT_MATCH_DAYS)
    hits = {}
    for r in declarations:
        ib, ie = r.get("incidentBeginDate"), r.get("incidentEndDate")
        if not ib:
            continue
        if r.get("incidentType") not in cfg.FEMA_INCIDENT_TYPES:
            continue
        d0 = datetime.fromisoformat(ib.replace("Z", "")).date()
        d1 = datetime.fromisoformat(ie.replace("Z", "")).date() if ie else d0
        if (d1 - d0).days > cfg.FEMA_MAX_INCIDENT_DAYS:
            continue
        if d0 - pad <= e and b <= d1 + pad:
            hits[str(r["disasterNumber"])] = {
                "number": str(r["disasterNumber"]),
                "title": r.get("declarationTitle"),
                "type": r.get("incidentType"),
                "declared": (r.get("declarationDate") or "")[:10],
                "incident": [ib[:10], (ie or ib)[:10]],
            }
    return list(hits.values())


def scope_note(disasters, events_per_declaration):
    """What a public or housing assistance figure on an event page is a figure of.

    Never "what this storm cost". Assistance is obligated against a declared
    disaster, and a declaration can cover a whole season. Where the same
    declaration is attached to more than one event here, the same total appears
    on each of their pages, and the note says how many pages that is.
    """
    if not disasters:
        return "no federal declaration covers this event"
    names = ["DR-" + d["number"] for d in disasters]
    numbers = names[0] if len(names) == 1 else \
        ", ".join(names[:-1]) + " and " + names[-1]
    over = max(events_per_declaration.get(d["number"], 1) for d in disasters)
    if len(names) == 1:
        base = f"obligated to declaration {numbers}"
        if over > 1:
            return (base + f", which is attached to {over} events here, "
                    f"this one among them")
        return base
    base = f"obligated to declarations {numbers}"
    if over > 1:
        return base + f", each attached to as many as {over} events here"
    return base


def event_nfip(event, claims_by_day):
    days = set(window_days(
        event, cfg.CONSEQUENCE_WINDOWS["fema-nfip"]["pad_days"]))
    rows = [c for d in days for c in claims_by_day.get(d, [])]
    if not rows:
        earliest = "1978-01-01"
        if event["end"] < earliest:
            return {"paid": na("$", "fema-nfip", "NFIP claims begin in 1978"),
                    "claims": na("", "fema-nfip")}
        return {"paid": ok(0, "$", "fema-nfip", "no claims dated in this window"),
                "claims": ok(0, "", "fema-nfip")}
    total = sum(r["paid"] for r in rows)
    by_boro = {}
    for r in rows:
        by_boro[r["boro"]] = by_boro.get(r["boro"], 0) + r["paid"]
    return {
        "paid": ok(round(total), "$", "fema-nfip"),
        "claims": ok(len(rows), "", "fema-nfip"),
        "by_borough": {b: ok(round(v), "$", "fema-nfip") for b, v in by_boro.items()},
    }


def index_nfip(fema):
    fips_to_boro = {v["fips"]: k for k, v in cfg.BOROUGHS.items()}
    by_day = {}
    for r in fema["nfip-claims"]:
        dol = r.get("dateOfLoss")
        if not dol:
            continue
        paid = 0.0
        for f in ("amountPaidOnBuildingClaim", "amountPaidOnContentsClaim",
                  "amountPaidOnIncreasedCostOfComplianceClaim"):
            if r.get(f):
                paid += float(r[f])
        by_day.setdefault(dol[:10], []).append({
            "paid": paid,
            "boro": fips_to_boro.get(str(r.get("countyCode")), "??"),
        })
    log(f"nfip: claims on {len(by_day)} distinct days")
    return by_day


# ---------------------------------------------------------------------------
# Inflation
# ---------------------------------------------------------------------------

def adjust(m, year, cpi, base_year):
    """Return the inflation-adjusted twin of a dollar measure.

    Both figures are always published. A single adjusted figure with no nominal
    beside it cannot be checked against the source document.
    """
    if m["s"] != cfg.STATUS_OK:
        return dict(m)
    y, b = str(year), str(base_year)
    if y not in cpi or b not in cpi:
        return missing("$", m.get("src"),
                       f"no {cfg.CPI_SERIES} index for {y}")
    value = round(m["v"] * cpi[b] / cpi[y])
    return ok(value, "$", m.get("src"),
              f"{base_year} dollars, CPI-U New York area")


# ---------------------------------------------------------------------------

def main():
    events = json.loads((cfg.BUILD / "events.json").read_text())
    fema = json.loads((cfg.BUILD / "fema.json").read_text())
    cpi = json.loads((cfg.BUILD / "cpi.json").read_text())

    print("[enrich] 311 and collisions", flush=True)
    families = {k: cached(f"311-{k}", lambda k=k: fetch_311_family(k))
                for k in cfg.COMPLAINT_FAMILIES}
    collisions = cached("collisions", fetch_collisions)

    print("[enrich] federal assistance", flush=True)
    idx = index_fema(fema)
    nfip_by_day = index_nfip(fema)

    print("[enrich] water levels", flush=True)
    tide_cache_path = CACHE / "tides.json"
    tides = json.loads(tide_cache_path.read_text()) if tide_cache_path.exists() else {}
    todo = [e for e in events
            if set(e["hazards"]) & cfg.TIDE_HAZARDS and e["event_id"] not in tides]
    for i, e in enumerate(todo, 1):
        try:
            tides[e["event_id"]] = event_tides(e)
        except Exception as exc:            # a gauge outage is not a build failure
            tides[e["event_id"]] = {"status": "missing", "why": str(exc)[:120]}
        if i % 25 == 0:
            log(f"tides: {i} of {len(todo)}")
            CACHE.mkdir(parents=True, exist_ok=True)
            tide_cache_path.write_text(json.dumps(tides, separators=(",", ":")))
    CACHE.mkdir(parents=True, exist_ok=True)
    tide_cache_path.write_text(json.dumps(tides, separators=(",", ":")))
    log(f"tides: {sum(1 for t in tides.values() if t and t.get('status') == 'ok')} "
        f"events with readings")

    # Declarations are matched for every event before any assistance is
    # attached, because the count of events a declaration covers is part of what
    # the figure means. DR-1083 covers fourteen events in this archive. Printing
    # its total against each of them without saying so would invite exactly the
    # reading this project exists to prevent: that the money was caused by, and
    # belongs to, that one storm.
    print("[enrich] federal declarations", flush=True)
    matched = {e["event_id"]: match_disasters(e, fema["declarations"])
               for e in events}
    events_per_declaration = {}
    for hits in matched.values():
        for d in hits:
            events_per_declaration[d["number"]] = \
                events_per_declaration.get(d["number"], 0) + 1
    shared = sum(1 for n in events_per_declaration.values() if n > 1)
    log(f"declarations: {len(events_per_declaration)} matched, "
        f"{shared} covering more than one event")

    print("[enrich] attaching", flush=True)
    for e in events:
        e["consequences"] = {k: sum_311(e, k, families[k]) for k in families}
        e["consequences"]["collisions"] = sum_collisions(e, collisions)
        e["tide"] = tides.get(e["event_id"])

        disasters = matched[e["event_id"]]
        for d in disasters:
            d["events_covered"] = events_per_declaration[d["number"]]
        e["disasters"] = disasters
        nums = [d["number"] for d in disasters]
        # The sentence every assistance figure on this event carries.
        scope = scope_note(disasters, events_per_declaration)

        pa = [idx["pa"][n] for n in nums if n in idx["pa"]]
        if not disasters:
            e["assistance"] = {
                "pa": na("$", "fema-pa", "no federal declaration covers this event"),
                "ia": na("$", "fema-ia-owners",
                         "no federal declaration covers this event"),
                "scope": scope,
            }
        else:
            e["assistance"] = {"scope": scope}
            if pa:
                e["assistance"]["pa"] = ok(round(sum(p["federal"] for p in pa)),
                                           "$", "fema-pa", scope)
                cats = {}
                for p in pa:
                    for c, v in p["by_category"].items():
                        cats[c] = cats.get(c, 0) + v
                e["assistance"]["pa_by_category"] = {
                    c: round(v) for c, v in sorted(cats.items(),
                                                   key=lambda x: -x[1])}
                e["assistance"]["pa_projects"] = ok(
                    sum(p["projects"] for p in pa), "", "fema-pa")
            else:
                e["assistance"]["pa"] = missing(
                    "$", "fema-pa", "declared, but no obligations published")
            ia = 0.0
            found = False
            for n in nums:
                for key in ("ia_owners", "ia_renters"):
                    if n in idx[key]:
                        ia += idx[key][n]["approved"]
                        found = True
            e["assistance"]["ia"] = (ok(round(ia), "$", "fema-ia-owners", scope)
                                     if found else
                                     missing("$", "fema-ia-owners",
                                             "declared, but no housing assistance published"))
        e["assistance"]["nfip"] = event_nfip(e, nfip_by_day)

        # Both dollar bases, always.
        year = e["year"]
        for key, holder in (("damage_property", e), ("damage_crops", e)):
            e[key + "_real"] = adjust(holder[key], year, cpi, cfg.CPI_BASE_YEAR)
        for key in ("pa", "ia"):
            e["assistance"][key + "_real"] = adjust(
                e["assistance"][key], year, cpi, cfg.CPI_BASE_YEAR)
        e["assistance"]["nfip_real"] = adjust(
            e["assistance"]["nfip"]["paid"], year, cpi, cfg.CPI_BASE_YEAR)

    (cfg.BUILD / "events-enriched.json").write_text(
        json.dumps(events, separators=(",", ":")))
    print(f"[enrich] {len(events)} events enriched", flush=True)


if __name__ == "__main__":
    main()
