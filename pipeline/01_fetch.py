"""Stage 1: download every bulk source into data-raw/ and record what arrived.

Only the standard library is used, here and everywhere else in the pipeline.
The data is small enough not to need pandas, and a project a non-professional
developer has to operate should not start with a dependency install.

Every download is checked for being the thing it claims to be. A moved NOAA file
and a FEMA outage both answer with HTTP 200 and an HTML error page, which a
naive fetch would happily write to disk and hand to the next stage.
"""

import gzip
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
cfg = importlib.import_module("00_config")


class FetchError(Exception):
    """A source did not answer with what the next stage needs."""


def get(url, expect=None, binary=False, retries=3, timeout=None):
    """Fetch a URL and check that the body looks like what was asked for.

    expect is one of None, "csv", "json", "gzip", "text". The check is
    deliberately shallow: it catches an HTML error page served with a 200,
    which is the failure that actually happens.
    """
    req = urllib.request.Request(url, headers={"User-Agent": cfg.USER_AGENT})
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(
                    req, timeout=timeout or cfg.REQUEST_TIMEOUT) as r:
                body = r.read()
            break
        except (urllib.error.URLError, TimeoutError) as exc:
            last = exc
            time.sleep(2 ** attempt)
    else:
        raise FetchError(f"{url}\n  gave up after {retries} attempts: {last}")

    head = body[:512]
    if expect == "gzip":
        if body[:2] != b"\x1f\x8b":
            raise FetchError(f"{url}\n  expected gzip, got {head[:80]!r}")
    elif expect in ("csv", "text", "json"):
        text_head = head.decode("utf-8", "replace").lstrip()
        if text_head[:1] == "<":
            raise FetchError(
                f"{url}\n  expected {expect}, got HTML. The file has probably "
                f"moved. Check the URL in pipeline/00_config.py."
            )
        if expect == "json":
            try:
                json.loads(body.decode("utf-8"))
            except ValueError as exc:
                raise FetchError(f"{url}\n  expected JSON: {exc}")
    time.sleep(cfg.REQUEST_PAUSE)
    return body if binary else body.decode("utf-8", "replace")


def write(path, data, mode="wb"):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, mode) as fh:
        fh.write(data)
    return path


def log(msg):
    print(f"  {msg}", flush=True)


# ---------------------------------------------------------------------------
# NOAA Storm Events
# ---------------------------------------------------------------------------

def fetch_storm_events(force=False):
    """One gzipped CSV per year. The file names carry a processing stamp that
    changes when NOAA reprocesses a year, so the listing is read rather than the
    names being constructed."""
    log("Storm Events: reading the file listing")
    # A directory listing is HTML by nature, so it is fetched unchecked and
    # judged on whether it actually names the files the next step needs.
    listing = get(cfg.SOURCES["ncei-storm-events"]["listing"])
    names = sorted(set(re.findall(
        r"StormEvents_details-ftp_v1\.0_d\d{4}_c\d{8}\.csv\.gz", listing)))
    if len(names) < 70:
        raise FetchError(
            f"Storm Events listing held {len(names)} detail files, expected at "
            f"least 70. The directory layout may have changed."
        )
    out = cfg.RAW / "storm-events"
    out.mkdir(parents=True, exist_ok=True)

    # A year already on disk under a different stamp means NOAA reprocessed it.
    existing = {p.name for p in out.glob("*.csv.gz")}
    for name in names:
        year = re.search(r"_d(\d{4})_", name).group(1)
        stale = [e for e in existing
                 if e.startswith(f"StormEvents_details-ftp_v1.0_d{year}_")
                 and e != name]
        for s in stale:
            log(f"  {year} was reprocessed, removing {s}")
            (out / s).unlink()
        if name in existing and not force:
            continue
        body = get(cfg.SOURCES["ncei-storm-events"]["url"] + name,
                   expect="gzip", binary=True)
        write(out / name, body)
    log(f"Storm Events: {len(names)} yearly files, "
        f"{sum(p.stat().st_size for p in out.glob('*.csv.gz')) // 1048576} MB")
    return names


# ---------------------------------------------------------------------------
# HURDAT2
# ---------------------------------------------------------------------------

def fetch_hurdat(force=False):
    """The file name carries the reissue date and changes every season, so the
    NHC data index is read to find the current Atlantic file."""
    target = cfg.RAW / "hurdat2.txt"
    if target.exists() and not force:
        log("HURDAT2: cached")
        return target
    index = get("https://www.nhc.noaa.gov/data/")  # an index page, so HTML
    names = sorted(set(re.findall(r"hurdat/hurdat2-\d{4}-\d{4}-\d+\.txt", index)))
    atlantic = [n for n in names if "nepac" not in n]
    if not atlantic:
        raise FetchError(
            "No Atlantic HURDAT2 file found at https://www.nhc.noaa.gov/data/. "
            "Check the page and update pipeline/00_config.py."
        )
    url = "https://www.nhc.noaa.gov/data/" + atlantic[-1]
    body = get(url, expect="text")
    if not body.lstrip().startswith("AL"):
        raise FetchError(f"{url}\n  does not look like HURDAT2")
    write(target, body.encode("utf-8"))
    log(f"HURDAT2: {atlantic[-1]}, {len(body) // 1024} KB")
    return target


# ---------------------------------------------------------------------------
# GHCN daily
# ---------------------------------------------------------------------------

def fetch_ghcn(force=False):
    """One CSV per station covering its whole record. Central Park is about
    3 MB for 150 years, which is why daily summaries were chosen over the hourly
    files at 7 MB per station-year."""
    base = cfg.SOURCES["ghcn-daily"]["url"]
    out = cfg.RAW / "ghcn"
    out.mkdir(parents=True, exist_ok=True)
    for sid in cfg.WEATHER_STATIONS:
        target = out / f"{sid}.csv"
        if target.exists() and not force:
            continue
        body = get(f"{base}{sid}.csv", expect="csv")
        if "STATION" not in body[:200]:
            raise FetchError(f"GHCN {sid}: no STATION column in the header")
        write(target, body.encode("utf-8"))
        log(f"GHCN {sid} ({cfg.WEATHER_STATIONS[sid]['name']}): "
            f"{len(body) // 1024} KB")
    return out


# ---------------------------------------------------------------------------
# FEMA
# ---------------------------------------------------------------------------

def fema(dataset_url, filt, select=None, order=None, page=None, timeout=None):
    """Page through an OpenFEMA dataset. The API caps a page at 10,000 rows and
    reports the full count in metadata, so paging is driven by that count rather
    than by an empty page."""
    rows = []
    skip = 0
    total = None
    entity = dataset_url.rstrip("/").split("/")[-1]
    while True:
        params = {
            "$filter": filt,
            "$top": str(page or cfg.FEMA_PAGE_SIZE),
            "$skip": str(skip),
            "$format": "json",
        }
        if select:
            params["$select"] = ",".join(select)
        if order:
            params["$orderby"] = order
        if total is None:
            params["$inlinecount"] = "allpages"
        url = dataset_url + "?" + urllib.parse.urlencode(params)
        payload = json.loads(get(url, expect="json", timeout=timeout))
        if total is None:
            total = payload["metadata"].get("count")
        batch = payload.get(entity, [])
        rows.extend(batch)
        skip += len(batch)
        if not batch or (total is not None and skip >= total):
            break
    return rows, total


def fetch_fema(force=False):
    out = cfg.RAW / "fema"
    out.mkdir(parents=True, exist_ok=True)
    # county names are not used as keys anywhere; codes only
    codes = ",".join(f"'{c}'" for c in cfg.NYC_COUNTY_CODES)

    jobs = {
        "declarations": (
            cfg.SOURCES["fema-declarations"]["url"],
            f"state eq 'NY' and fipsStateCode eq '36' and fipsCountyCode in "
            f"({','.join(chr(39) + c[2:] + chr(39) for c in cfg.NYC_COUNTY_CODES)})",
            None,
        ),
        # Public Assistance writes the county as the FIPS county part with no
        # leading zero, so Bronx is '5' and not '005'. The declarations dataset
        # zero-pads the same field. Both are county codes, neither is a name.
        "public-assistance": (
            cfg.SOURCES["fema-pa"]["url"],
            "stateNumberCode eq '36' and countyCode in ("
            + ",".join(f"'{c[2:].lstrip('0')}'" for c in cfg.NYC_COUNTY_CODES) + ")",
            None,
        ),
        "ia-owners": (
            cfg.SOURCES["fema-ia-owners"]["url"],
            "state eq 'NY'",
            None,
        ),
        "ia-renters": (
            cfg.SOURCES["fema-ia-renters"]["url"],
            "state eq 'NY'",
            None,
        ),
    }

    for name, (url, filt, select) in jobs.items():
        target = out / f"{name}.json"
        if target.exists() and not force:
            log(f"FEMA {name}: cached")
            continue
        rows, total = fema(url, filt, select)
        if total is not None and len(rows) != total:
            raise FetchError(
                f"FEMA {name}: the API reported {total} rows and {len(rows)} "
                f"arrived. Paging is wrong, or the dataset changed mid-fetch."
            )
        write(target, json.dumps(rows).encode("utf-8"))
        log(f"FEMA {name}: {len(rows)} rows")

    # NFIP claims are fetched one county at a time. The whole-city filter runs
    # across 2.7 million rows and times out; five narrower queries do not.
    target = out / "nfip-claims.json"
    if not target.exists() or force:
        select = ["dateOfLoss", "countyCode", "occupancyType", "causeOfDamage",
                  "ratedFloodZone", "floodZoneCurrent",
                  "basementEnclosureCrawlspaceType", "amountPaidOnBuildingClaim",
                  "amountPaidOnContentsClaim",
                  "amountPaidOnIncreasedCostOfComplianceClaim",
                  "latitude", "longitude"]
        claims = []
        for code in cfg.NYC_COUNTY_CODES:
            rows, total = fema(cfg.SOURCES["fema-nfip"]["url"],
                               f"countyCode eq '{code}'", select,
                               page=1000, timeout=180)
            if total is not None and len(rows) != total:
                raise FetchError(
                    f"FEMA nfip-claims {code}: expected {total} rows, got "
                    f"{len(rows)}")
            log(f"FEMA nfip-claims {code}: {len(rows)} claims")
            claims.extend(rows)
        write(target, json.dumps(claims).encode("utf-8"))
        log(f"FEMA nfip-claims: {len(claims)} rows")
    else:
        log("FEMA nfip-claims: cached")
    return out


# ---------------------------------------------------------------------------
# Inflation
# ---------------------------------------------------------------------------

def fetch_cpi(force=False):
    """The public BLS API without a registered key returns ten years per call
    and caps daily requests, so the series is assembled once and cached."""
    target = cfg.RAW / "cpi.json"
    if target.exists() and not force:
        log("CPI: cached")
        return target
    series = {}
    year = cfg.CPI_START_YEAR
    now = datetime.now(timezone.utc).year
    while year <= now:
        end = min(year + 9, now)
        url = (f"{cfg.SOURCES['bls-cpi']['url']}"
               f"?startyear={year}&endyear={end}")
        payload = json.loads(get(url, expect="json"))
        if payload.get("status") != "REQUEST_SUCCEEDED":
            raise FetchError(
                f"BLS refused the request for {year} to {end}: "
                f"{payload.get('message')}. The public API has a daily cap; "
                f"try again tomorrow or register a key."
            )
        for s in payload["Results"]["series"]:
            for row in s["data"]:
                if not row["period"].startswith("M") or row["period"] == "M13":
                    continue
                # BLS writes "-" where a month was not published. That is a
                # missing month, not a zero, so it is skipped and the year is
                # then dropped for being incomplete.
                try:
                    value = float(row["value"])
                except ValueError:
                    continue
                series.setdefault(row["year"], []).append(value)
        year = end + 1
    annual = {y: round(sum(v) / len(v), 3) for y, v in series.items()
              if len(v) == 12}
    if str(cfg.CPI_BASE_YEAR) not in annual:
        # The base year is incomplete until its December is published. Fall back
        # to the most recent complete year and say so rather than silently
        # deflating to a partial average.
        log(f"CPI: {cfg.CPI_BASE_YEAR} is not yet a complete year")
    write(target, json.dumps({"series": cfg.CPI_SERIES, "annual": annual},
                             indent=1).encode("utf-8"))
    log(f"CPI: {len(annual)} complete years, "
        f"{min(annual)} to {max(annual)}")
    return target


# ---------------------------------------------------------------------------

def main(force=False, only=None):
    cfg.RAW.mkdir(parents=True, exist_ok=True)
    steps = {
        "storm-events": fetch_storm_events,
        "hurdat": fetch_hurdat,
        "ghcn": fetch_ghcn,
        "fema": fetch_fema,
        "cpi": fetch_cpi,
    }
    manifest = {}
    for name, fn in steps.items():
        if only and name != only:
            continue
        print(f"[fetch] {name}", flush=True)
        fn(force=force)
        manifest[name] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    path = cfg.RAW / "fetch-manifest.json"
    old = json.loads(path.read_text()) if path.exists() else {}
    old.update(manifest)
    write(path, json.dumps(old, indent=1).encode("utf-8"))
    print(f"[fetch] done, {len(manifest)} sources", flush=True)


if __name__ == "__main__":
    args = sys.argv[1:]
    main(force="--force" in args,
         only=next((a.split("=")[1] for a in args if a.startswith("--only=")), None))
