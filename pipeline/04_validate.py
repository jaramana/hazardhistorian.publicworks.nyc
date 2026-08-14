"""Stage 4: test the build rather than trusting it.

The export stage refuses to run if this stage fails, so a bad build leaves the
published files untouched.

Failures are things that make a figure wrong. Warnings are things that are
simply how the data is: an event with no weather station reporting in 1958, a
hazard that appears twice in a century. A warning that becomes normal should be
read, not silenced.

If a check starts failing, read the source before changing the threshold. A
threshold moved to make a build pass is how a project stops noticing that its
data broke.
"""

import importlib
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
cfg = importlib.import_module("00_config")

FAIL, WARN = [], []


def fail(check, detail):
    FAIL.append((check, detail))


def warn(check, detail):
    WARN.append((check, detail))


def check_grains(events, rows):
    """Every table declares one row per something. Test it, do not assume it."""
    ids = [e["event_id"] for e in events]
    dupes = [k for k, n in Counter(ids).items() if n > 1]
    if dupes:
        fail("events grain", f"duplicated event_id: {dupes[:5]}")

    # An event identifier is public. It becomes a file name, a query string and
    # anything anyone cites. A synthetic key once carried timestamps, which put
    # colons in both, and the site's own identifier check then refused to load
    # those events at all.
    unsafe = [i for i in ids if not re.match(r"^[A-Za-z0-9_-]+$", i)]
    if unsafe:
        fail("event identifiers",
             f"{len(unsafe)} are not safe in a URL or a file name: "
             f"{unsafe[:3]}")
    long_ids = [i for i in ids if len(i) > 40]
    if long_ids:
        warn("event identifiers",
             f"{len(long_ids)} are longer than 40 characters: {long_ids[:2]}")

    row_ids = [r["event_row_id"] for r in rows]
    dupes = [k for k, n in Counter(row_ids).items() if n > 1]
    if dupes:
        fail("event_rows grain", f"duplicated event_row_id: {dupes[:5]}")

    # Referential integrity, in both directions.
    known = set(row_ids)
    for e in events:
        orphan = [r for r in e["rows"] if r not in known]
        if orphan:
            fail("referential integrity",
                 f"{e['event_id']} names rows that do not exist: {orphan[:3]}")
    attached = {r for e in events for r in e["rows"]}
    stranded = known - attached
    if stranded:
        fail("referential integrity",
             f"{len(stranded)} event rows belong to no event")


def check_counts(events, rows):
    n = len(events)
    if not cfg.VALIDATION["min_events"] <= n <= cfg.VALIDATION["max_events"]:
        fail("event count",
             f"{n} events, expected between {cfg.VALIDATION['min_events']} and "
             f"{cfg.VALIDATION['max_events']}. Read the source before moving "
             f"the bound.")
    if len(rows) < cfg.VALIDATION["min_event_rows"]:
        fail("row count", f"{len(rows)} event rows, expected at least "
                          f"{cfg.VALIDATION['min_event_rows']}")


def check_dates(events):
    now = datetime.now()
    horizon = now + timedelta(days=cfg.VALIDATION["max_future_days"])
    for e in events:
        b = datetime.fromisoformat(e["begin"])
        end = datetime.fromisoformat(e["end"])
        if b.year < cfg.VALIDATION["min_year"]:
            fail("dates", f"{e['event_id']} begins in {b.year}")
        if b > horizon:
            fail("dates", f"{e['event_id']} begins in the future: {e['begin']}")
        if end < b:
            fail("dates", f"{e['event_id']} ends before it begins")
        if (end - b) > timedelta(days=120):
            warn("dates", f"{e['event_id']} runs {(end - b).days} days, which is "
                          f"long even for a drought")


def check_geography(events):
    counts = Counter(p for e in events for p in e["places"])
    total = sum(counts.values())
    if total:
        for boro, n in counts.items():
            if n / total > cfg.VALIDATION["max_borough_share"]:
                fail("geography",
                     f"{boro} holds {n / total:.0%} of all place records, which "
                     f"suggests the zone mapping is wrong")
    for code in cfg.BOROUGH_ORDER:
        if code not in counts:
            fail("geography", f"no events at all in {cfg.BOROUGHS[code]['name']}")


def check_hazards(events):
    seen = Counter(h for e in events for h in e["hazards"])
    if len(seen) < cfg.VALIDATION["required_hazard_coverage"]:
        fail("hazards", f"only {len(seen)} distinct hazards appear, expected at "
                        f"least {cfg.VALIDATION['required_hazard_coverage']}")
    for h in seen:
        if h not in cfg.HAZARDS:
            fail("hazards", f"{h} is not declared in HAZARDS")


def walk_measures(node, path=""):
    """Yield every measure dict anywhere in the tree."""
    if isinstance(node, dict):
        if "s" in node and "v" in node and len(node) <= 6:
            yield path, node
            return
        for k, v in node.items():
            yield from walk_measures(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk_measures(v, f"{path}[{i}]")


def check_value_model(events):
    """The rule the whole project turns on: no absence is ever a zero, and no
    status is ever absent."""
    bad_status = zero_missing = no_unit = 0
    statuses = Counter()
    for e in events:
        for path, m in walk_measures(e, e["event_id"]):
            statuses[m["s"]] += 1
            if m["s"] not in cfg.STATUS_LABELS:
                bad_status += 1
                fail("value model", f"{path} has unknown status {m['s']!r}")
            if m["s"] != cfg.STATUS_OK and m["v"] is not None \
                    and m["s"] != cfg.STATUS_CENSORED:
                zero_missing += 1
                fail("value model",
                     f"{path} is {m['s']} but carries the value {m['v']!r}")
            if m["s"] == cfg.STATUS_OK and m["v"] is None:
                fail("value model", f"{path} is ok but carries no value")
    print("    measure statuses: "
          + ", ".join(f"{k} {v}" for k, v in statuses.most_common()))
    if statuses.get(cfg.STATUS_NA, 0) == 0:
        fail("value model",
             "not one measure is marked not applicable. Every consequence "
             "dataset starts later than the event record, so this cannot be "
             "right.")


def check_dollars(events):
    """Nominal and adjusted must both exist, and adjusted must be the larger of
    the two for any year before the base year."""
    checked = 0
    for e in events:
        nominal = e.get("damage_property")
        real = e.get("damage_property_real")
        if not nominal or not real:
            continue
        if nominal["s"] == cfg.STATUS_OK and real["s"] == cfg.STATUS_OK:
            checked += 1
            if e["year"] < cfg.CPI_BASE_YEAR and real["v"] < nominal["v"]:
                fail("inflation",
                     f"{e['event_id']} adjusts {nominal['v']} in {e['year']} "
                     f"down to {real['v']} in {cfg.CPI_BASE_YEAR} dollars")
    if checked == 0:
        warn("inflation", "no event has both a nominal and an adjusted figure")
    else:
        print(f"    inflation: {checked} events carry both dollar bases")


def check_narratives(events):
    without = [e for e in events if not e["narrative"]]
    share = len(without) / max(1, len(events))
    if share > 0.5:
        warn("narratives",
             f"{share:.0%} of events have no narrative. NOAA did not write "
             f"episode narratives before 1996.")


def check_weather(events):
    reporting = [e for e in events if e["weather"].get("_stations")]
    if len(reporting) < len(events) * 0.5:
        warn("weather",
             f"only {len(reporting)} of {len(events)} events have any station "
             f"reading")
    recent = [e for e in events if e["year"] >= 2000]
    silent = [e for e in recent if len(e["weather"].get("_stations", [])) <
              cfg.VALIDATION["min_stations_reporting"]]
    if len(silent) > len(recent) * 0.1:
        fail("weather",
             f"{len(silent)} events since 2000 have fewer than "
             f"{cfg.VALIDATION['min_stations_reporting']} stations reporting")


def check_assistance(events):
    """A federal declaration belongs to one storm, or at most a handful.

    This check exists because of a bug it would have caught. The COVID-19
    declarations carry an incident period of 1,207 days, and matching on overlap
    alone attached them, and their public assistance, to every event for three
    years. Hurricane Ida briefly showed 10.7 billion dollars.

    A disaster spread across many events is the signature of that mistake, in
    whatever form it comes back.
    """
    spread = Counter()
    windows = {}
    for e in events:
        for d in e.get("disasters", []):
            spread[d["number"]] += 1
            windows[d["number"]] = d["incident"]

    # The defect is a long incident period, not a high event count. The Weather
    # Service split the Blizzard of 1996 into fourteen episodes of its own, so
    # one declaration legitimately covers fourteen events here. What is never
    # legitimate is a declaration whose incident period is too long to be about
    # one storm, which is how the pandemic money reached Hurricane Ida.
    for number, (start, end) in windows.items():
        length = (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days
        if length > cfg.FEMA_MAX_INCIDENT_DAYS:
            fail("assistance",
                 f"declaration {number} has an incident period of {length} days "
                 f"and is still attached to events. The filter in "
                 f"match_disasters did not hold.")
        elif spread[number] > 8:
            warn("assistance",
                 f"declaration {number} is attached to {spread[number]} events. "
                 f"That is the source splitting one storm, not an error, but it "
                 f"is worth a look.")
    # A public or housing assistance figure is obligated against a declaration,
    # not against a storm, and it must never be published without saying which
    # declaration and how many events here share it. The note is built in
    # scope_note and is compulsory, so a future change that drops it fails the
    # build instead of quietly turning declaration money into storm money.
    for e in events:
        for key in ("pa", "ia"):
            m = e["assistance"].get(key)
            if m and m["s"] == cfg.STATUS_OK and not m.get("n"):
                fail("assistance",
                     f"{e['event_id']} publishes a {key} value with no "
                     f"declaration scope attached to it")

    biggest = max(
        ((e, e["assistance"]["pa"]["v"]) for e in events
         if e["assistance"].get("pa", {}).get("s") == cfg.STATUS_OK),
        key=lambda x: x[1], default=None)
    if biggest:
        event, value = biggest
        print(f"    largest public assistance: {value / 1e9:.2f} bn, "
              f"{event['name'] or event['event_id']}")
        if event["event_id"] != "E20121029-sandy":
            warn("assistance",
                 f"the largest public assistance figure belongs to "
                 f"{event['event_id']}, not to Sandy. That may be right, and it "
                 f"is worth reading before publishing.")


def check_known_facts(events):
    """A small set of facts checked against the published record.

    These exist because a pipeline can be internally consistent and still wrong.
    """
    by_id = {e["event_id"]: e for e in events}
    sandy = by_id.get("E20121029-sandy")
    if not sandy:
        fail("known facts", "Sandy is not in the build under E20121029-sandy")
        return
    if sandy["deaths_direct"]["s"] != cfg.STATUS_OK:
        fail("known facts", "Sandy has no direct death count")
    elif not 30 <= sandy["deaths_direct"]["v"] <= 60:
        fail("known facts",
             f"Sandy shows {sandy['deaths_direct']['v']} direct deaths, which "
             f"is outside the range the published record supports")
    if "coastal-flooding" not in sandy["hazards"]:
        fail("known facts", "Sandy is not classified as coastal flooding")
    if len(sandy["episodes"]) < 2:
        fail("known facts",
             "Sandy should merge two NOAA episodes; the merge in "
             "EVENT_MERGES did not take effect")
    tide = sandy.get("tide") or {}
    if tide.get("status") == "ok":
        peak = tide["peak_level"]["v"]
        if not 12 <= peak <= 16:
            fail("known facts",
                 f"Sandy peak water level at The Battery reads {peak} ft "
                 f"{cfg.TIDE_DATUM}, and the published figure is near 14 ft")
        else:
            print(f"    Sandy peak water level: {peak} ft {cfg.TIDE_DATUM}")


def main():
    events = json.loads((cfg.BUILD / "events-enriched.json").read_text())
    rows = json.loads((cfg.BUILD / "event_rows.json").read_text())
    print(f"[validate] {len(events)} events, {len(rows)} rows")

    for check in (lambda: check_grains(events, rows),
                  lambda: check_counts(events, rows),
                  lambda: check_dates(events),
                  lambda: check_geography(events),
                  lambda: check_hazards(events),
                  lambda: check_value_model(events),
                  lambda: check_dollars(events),
                  lambda: check_narratives(events),
                  lambda: check_weather(events),
                  lambda: check_assistance(events),
                  lambda: check_known_facts(events)):
        check()

    for name, detail in WARN:
        print(f"  warning  {name}: {detail}")
    for name, detail in FAIL:
        print(f"  FAIL     {name}: {detail}")

    report = {"events": len(events), "rows": len(rows),
              "warnings": WARN, "failures": FAIL,
              "when": datetime.now().isoformat(timespec="seconds")}
    (cfg.BUILD / "validation.json").write_text(json.dumps(report, indent=1))

    if FAIL:
        print(f"[validate] {len(FAIL)} failures. Export will not run.")
        sys.exit(1)
    print(f"[validate] passed with {len(WARN)} warnings")


if __name__ == "__main__":
    main()
