"""Stage 5: write the site's data and the public downloads.

Everything is written into build/staging/ first and moved into place in one
step, so a failure part way through cannot leave the published site half
updated.

The site, the downloads and the per-event files all come from the same objects
in memory, which is the only way to guarantee they cannot disagree.
"""

import csv
import importlib
import io
import json
import os
import shutil
import sys
import zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
cfg = importlib.import_module("00_config")


def flat(m):
    """A measure as a single cell for a spreadsheet, plus its status column.

    The status travels with the value into the download. A CSV that shows an
    empty cell for both "nothing happened" and "nobody looked" is the same bug
    in a different container.
    """
    if m is None:
        return "", ""
    return ("" if m["v"] is None else m["v"]), m["s"]


def index_entry(e):
    """One row of the search index. Kept small: it is loaded on every visit."""
    def v(m):
        return m["v"] if m and m["s"] == cfg.STATUS_OK else None

    w = e["weather"]
    tide = e.get("tide") or {}
    cons = e["consequences"]
    return {
        "id": e["event_id"],
        "n": e["name"],
        "b": e["begin"],
        "e": e["end"],
        "y": e["year"],
        "h": e["hazards"],
        "p": e["places"],
        "hb": 1 if e["harbor"] else 0,
        "d": v(e["deaths_direct"]),
        "i": v(e["injuries_direct"]),
        "dp": v(e["damage_property"]),
        "dpr": v(e.get("damage_property_real")),
        "tx": v(w.get("temp_max")),
        "tn": v(w.get("temp_min")),
        "rd": v(w.get("rain_daily")),
        "rt": v(w.get("rain_total")),
        "sd": v(w.get("snow_daily")),
        "st": v(w.get("snow_total")),
        "wg": v(w.get("wind_2min")),
        "tp": tide.get("peak_level", {}).get("v") if tide.get("status") == "ok" else None,
        "sg": tide.get("peak_surge", {}).get("v") if tide.get("status") == "ok" else None,
        "pa": v(e["assistance"].get("pa")),
        "ia": v(e["assistance"].get("ia")),
        "nf": v(e["assistance"].get("nfip", {}).get("paid")),
        "c3": v(cons.get("no-heat", {}).get("total")),
        "cf": v(cons.get("flooding", {}).get("total")),
        "ct": v(cons.get("trees", {}).get("total")),
        "cc": v(cons.get("collisions", {}).get("total")),
        "dec": len(e.get("disasters", [])),
        "tk": 1 if e.get("tracks") else 0,
    }


def event_file(e, rows_by_id):
    """The full record for one event, which is what an event page loads."""
    out = dict(e)
    out["evidence"] = [
        {k: r[k] for k in ("event_row_id", "hazard", "ncei_type", "place",
                           "begin", "end", "deaths_direct", "injuries_direct",
                           "damage_property", "magnitude", "magnitude_type",
                           "flood_cause", "tor_scale", "report_source",
                           "event_narrative", "lat", "lon", "note")}
        for r in (rows_by_id[i] for i in e["rows"])
    ]
    out.pop("rows", None)
    return out


def write_downloads(events, rows, staging):
    """One consolidated table, plus the row-level evidence, plus a manifest.

    A single complete download satisfies the brief. Two files are published
    because the event table and its evidence have different grains, and putting
    them in one sheet would force one of them to repeat.
    """
    downloads = staging / "downloads"
    downloads.mkdir(parents=True, exist_ok=True)

    event_cols = [
        ("event_id", lambda e: e["event_id"]),
        ("name", lambda e: e["name"] or ""),
        ("begin", lambda e: e["begin"]),
        ("end", lambda e: e["end"]),
        ("year", lambda e: e["year"]),
        ("hazards", lambda e: ";".join(e["hazards"])),
        ("boroughs", lambda e: ";".join(e["places"])),
        ("harbor", lambda e: int(e["harbor"])),
        ("noaa_episodes", lambda e: ";".join(e["episodes"])),
        ("merged_by_project", lambda e: int(e["merged"])),
    ]
    measure_cols = [
        ("deaths_direct", lambda e: e["deaths_direct"]),
        ("deaths_indirect", lambda e: e["deaths_indirect"]),
        ("injuries_direct", lambda e: e["injuries_direct"]),
        ("damage_property_nominal_usd", lambda e: e["damage_property"]),
        (f"damage_property_{cfg.CPI_BASE_YEAR}_usd",
         lambda e: e.get("damage_property_real")),
        ("temp_max_f", lambda e: e["weather"].get("temp_max")),
        ("temp_min_f", lambda e: e["weather"].get("temp_min")),
        ("rain_event_total_in", lambda e: e["weather"].get("rain_total")),
        ("snow_event_total_in", lambda e: e["weather"].get("snow_total")),
        ("wind_fastest_2min_mph", lambda e: e["weather"].get("wind_2min")),
        ("fema_pa_declaration_usd", lambda e: e["assistance"].get("pa")),
        (f"fema_pa_declaration_{cfg.CPI_BASE_YEAR}_usd",
         lambda e: e["assistance"].get("pa_real")),
        ("fema_ia_declaration_usd", lambda e: e["assistance"].get("ia")),
        ("nfip_paid_nominal_usd", lambda e: e["assistance"].get("nfip", {}).get("paid")),
        ("nfip_claims", lambda e: e["assistance"].get("nfip", {}).get("claims")),
        ("complaints_no_heat", lambda e: e["consequences"]["no-heat"]["total"]),
        ("complaints_flooding", lambda e: e["consequences"]["flooding"]["total"]),
        ("complaints_trees", lambda e: e["consequences"]["trees"]["total"]),
        ("collisions", lambda e: e["consequences"]["collisions"]["total"]),
        ("collisions_injured", lambda e: e["consequences"]["collisions"].get("injured")),
    ]

    header = [c[0] for c in event_cols]
    for name, _ in measure_cols:
        header += [name, name + "_status"]
    header += ["peak_water_level_ft_mllw", "peak_surge_ft", "tide_station",
               "fema_disasters", "narrative"]

    path = downloads / "nyc-hazard-historian-events.csv"
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        for e in events:
            row = [fn(e) for _, fn in event_cols]
            for _, fn in measure_cols:
                value, status = flat(fn(e))
                row += [value, status]
            tide = e.get("tide") or {}
            if tide.get("status") == "ok":
                row += [tide["peak_level"]["v"],
                        tide.get("peak_surge", {}).get("v", ""),
                        tide.get("station_name", "")]
            else:
                row += ["", "", ""]
            row.append(";".join(d["number"] for d in e.get("disasters", [])))
            row.append(e["narrative"])
            w.writerow(row)

    path2 = downloads / "nyc-hazard-historian-evidence.csv"
    with open(path2, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["noaa_event_id", "event_id", "noaa_episode_id", "hazard",
                    "noaa_event_type", "place", "begin", "end",
                    "deaths_direct", "deaths_direct_status",
                    "injuries_direct", "injuries_direct_status",
                    "damage_property_usd", "damage_property_status",
                    "magnitude", "magnitude_type", "flood_cause",
                    "tornado_scale", "report_source", "latitude", "longitude",
                    "data_note", "narrative"])
        event_of = {r: e["event_id"] for e in events for r in e["rows"]}
        for r in rows:
            w.writerow([
                r["event_row_id"], event_of.get(r["event_row_id"], ""),
                r["episode_id"], r["hazard"], r["ncei_type"], r["place"],
                r["begin"], r["end"],
                *flat(r["deaths_direct"]), *flat(r["injuries_direct"]),
                *flat(r["damage_property"]),
                r["magnitude"] or "", r["magnitude_type"] or "",
                r["flood_cause"] or "", r["tor_scale"] or "",
                r["report_source"] or "", r["lat"] or "", r["lon"] or "",
                r["note"] or "", r["event_narrative"],
            ])

    readme = downloads / "README.txt"
    readme.write_text(f"""NYC Hazard Historian, full data download
Built {datetime.now(timezone.utc).strftime('%d %B %Y')}

Two files, two grains.

nyc-hazard-historian-events.csv
  One row per event. An event is a NOAA Storm Events episode, except where
  this project merged episodes by hand; merged_by_project marks those.

nyc-hazard-historian-evidence.csv
  One row per NOAA event record: one hazard type, one place, one time window.
  Join to the events file on event_id.

The two FEMA assistance columns are named for the declaration because that is
what they are obligated against. A declaration can cover several events in this
file, and where it does, the same total appears on each of their rows. The
fema_disasters column holds the declaration numbers: use it to deduplicate
before summing anything, and do not read either column as the cost of a storm.

Every measure has a _status column beside it. Read it before using the value.

  ok          a real reported value
  missing     the source covers this period and published no value
  na          the source cannot cover this period at all, usually because the
              dataset starts later than the event
  suppressed  the publisher withheld it
  censored    the publisher published a bound rather than a value

An empty value cell with status na is not a zero. Nothing in these files
defaults an absence to zero.

Dollars appear twice, nominal as published and adjusted to {cfg.CPI_BASE_YEAR}
using the BLS CPI-U for New York-Newark-Jersey City, series {cfg.CPI_SERIES}.
Column names state which is which.

Sources, coverage and known limitations are at
https://{cfg.SITE_HOST}/method.html

This project is not affiliated with New York City Emergency Management or the
City of New York. It reconstructs a public record from published sources.
""", encoding="utf-8")

    total = sum(p.stat().st_size for p in downloads.glob("*"))
    print(f"  downloads: {total // 1024} KB across {len(list(downloads.glob('*')))} files")


def main():
    report_path = cfg.BUILD / "validation.json"
    if not report_path.exists():
        sys.exit("No validation report. Run stage 4 first.")
    report = json.loads(report_path.read_text())
    if report["failures"]:
        sys.exit(f"Validation failed with {len(report['failures'])} failures. "
                 f"Export refuses to run so the published files stay as they are.")

    events = json.loads((cfg.BUILD / "events-enriched.json").read_text())
    rows = json.loads((cfg.BUILD / "event_rows.json").read_text())
    rows_by_id = {r["event_row_id"]: r for r in rows}

    staging = cfg.STAGING
    if staging.exists():
        shutil.rmtree(staging)
    (staging / "data" / "events").mkdir(parents=True, exist_ok=True)

    print("[export] index")
    index = [index_entry(e) for e in events]
    (staging / "data" / "index.json").write_text(
        json.dumps(index, separators=(",", ":")))

    print("[export] event files")
    for e in events:
        (staging / "data" / "events" / f"{e['event_id']}.json").write_text(
            json.dumps(event_file(e, rows_by_id), separators=(",", ":")))

    print("[export] metadata")
    cpi = json.loads((cfg.BUILD / "cpi.json").read_text())
    years = sorted({e["year"] for e in events})
    meta = {
        "site": cfg.SITE_NAME,
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "events": len(events),
        "event_rows": len(rows),
        "coverage": {"first": min(years), "last": max(years)},
        # Distinct declarations, not the sum of per-event counts. A declaration
        # attached to fourteen events is one declaration.
        "declarations": len({d["number"] for e in events
                             for d in e.get("disasters", [])}),
        "boroughs": cfg.BOROUGHS,
        "borough_order": cfg.BOROUGH_ORDER,
        "hazards": cfg.HAZARDS,
        "characteristics": cfg.CHARACTERISTICS,
        "operators": cfg.OPERATORS,
        "statuses": cfg.STATUS_LABELS,
        "sources": cfg.SOURCES,
        "radar": cfg.RADAR,
        "basemap": cfg.BASEMAP,
        "cpi": {"series": cfg.CPI_SERIES, "base_year": cfg.CPI_BASE_YEAR,
                "annual": cpi},
        "complaint_families": {k: {"label": v["label"], "types": v["types"]}
                               for k, v in cfg.COMPLAINT_FAMILIES.items()},
        "windows": cfg.CONSEQUENCE_WINDOWS,
        "stations": {"weather": cfg.WEATHER_STATIONS, "tide": cfg.TIDE_STATIONS},
        "validation": {"warnings": report["warnings"], "when": report["when"]},
        "compare_max": cfg.COMPARE_MAX,
        "page_size": cfg.EVENTS_PER_PAGE,
    }
    (staging / "data" / "meta.json").write_text(
        json.dumps(meta, separators=(",", ":")))

    print("[export] downloads")
    write_downloads(events, rows, staging)

    # Move into place in one step per directory.
    for name in ("data", "downloads"):
        src, dst = staging / name, cfg.SITE / name
        if not src.exists():
            continue
        if dst.exists():
            shutil.rmtree(dst)
        shutil.move(str(src), str(dst))

    size = sum(p.stat().st_size for p in (cfg.SITE / "data").rglob("*")
               if p.is_file())
    print(f"[export] {len(events)} events, data {size // 1024} KB, "
          f"index {len(json.dumps(index)) // 1024} KB")


if __name__ == "__main__":
    main()
