# Source manifest

Candidate public sources for NYC Hazard Historian, with what was checked and
what was found. Every row marked **verified** was requested directly on
12 August 2026 and the response is described. Rows marked **unverified** are
candidates that have not yet been requested and must not be relied on until they
are.

Coverage figures come from querying the data, not from a portal's update date.
Several NYC datasets report a recent update when only the description changed.

## Event spine

### NOAA Storm Events Database, NCEI

**Verified.** Directory listing at
`https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/`.

| Property | Value |
| --- | --- |
| Publisher | NOAA National Centers for Environmental Information |
| Files | `StormEvents_details`, `StormEvents_locations`, `StormEvents_fatalities` |
| Years present | 1950 to 2026, 77 files per family |
| Latest processing stamp | `c20260728` |
| Retrieval | Gzipped CSV over HTTPS, one file per year per family |
| Grain | One row per storm event; events group into episodes by `EPISODE_ID` |
| NYC keys | State FIPS 36, county FIPS 005 Bronx, 047 Kings, 061 New York, 081 Queens, 085 Richmond |
| Notable fields | `EVENT_ID`, `EPISODE_ID`, `EVENT_TYPE`, `BEGIN_DATE_TIME`, `END_DATE_TIME`, `INJURIES_DIRECT`, `DEATHS_DIRECT`, `DAMAGE_PROPERTY`, `EPISODE_NARRATIVE`, `EVENT_NARRATIVE` |
| Caveats | All event types only from 1996; 1950 to 1995 covers tornado, hail and wind alone. Damage values are strings such as `19.00B` and need parsing. Narratives are NWS-authored. |

This is the event spine. HHC's narratives, hazard types, critical issues and
fatality counts match this database in structure and wording.

**Open question, carried forward.** HHC offers events back to 23 September 1785,
far earlier than this database. Those early events come from somewhere else,
most likely the Hazard Mitigation Plan's historical profiles. Coverage before
1950 is not reproducible from Storm Events and is a candidate for deferral.

### Storm tracks, HURDAT2

**Verified.** File `hurdat/hurdat2-1851-2025-02272026.txt` is listed at
`https://www.nhc.noaa.gov/data/`. Atlantic basin, 1851 to 2025, six-hourly
best-track positions with intensity. A north-east Pacific file also exists and is
not relevant. Fixed-width comma text, one header line per storm followed by its
track points.

## Radar

### Iowa Environmental Mesonet NEXRAD composite tiles

**Verified by direct tile request.** Iowa State University Department of
Agronomy, `mesonet.agron.iastate.edu`.

| Template | Request tested | Result |
| --- | --- | --- |
| `ridge::USCOMP-N0R-{ts}` | `200001170700` | 200, PNG, 1.1 KB |
| `ridge::USCOMP-N0R-{ts}` | `201210300000` | 200, PNG, 12 KB |
| `ridge::USCOMP-N0Q-{ts}` | `201210300000` | 503 |
| `ridge::USCOMP-N0Q-{ts}` | `202109020100` | 200, PNG, 33 KB |

URL form:
`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/{layer}/{z}/{x}/{y}.png`

Findings that shape the implementation:

- The archive reaches back to at least January 2000 in the N0R product, which
  covers the dense part of the record.
- N0Q is unavailable in 2012 and available in 2021, so the two products cover
  different periods and the site must select the product by date rather than
  offering both. The exact changeover date is **not yet established** and must be
  found by probing before any radar UI is built.
- These are plain XYZ raster tiles, so MapLibre GL consumes them directly. No
  Esri dependency and no NEXRAD Level II processing.
- Timestamps are UTC, `YYYYMMDDHHMM`, on a five-minute step.
- **Unverified:** the service's stated use and attribution terms, and whether
  heavy sequential requests are acceptable. This must be read and honored before
  release, and caching frames rather than hot-linking every step is the
  courteous default.

## Observations

### Weather stations, NCEI Local Climatological Data

**Verified.** `https://www.ncei.noaa.gov/data/local-climatological-data/access/2012/72505394728.csv`
returned 200 and 6.98 MB for Central Park, 2012.

Hourly and sub-hourly observations with `HourlyDryBulbTemperature`,
`HourlyPrecipitation`, `HourlyWindSpeed`, `HourlyRelativeHumidity`,
`HourlySeaLevelPressure` and related fields, one CSV per station per year.

**Size consequence.** Roughly 7 MB per station-year. A dozen stations over
twenty-six years is on the order of two gigabytes of raw CSV. The pipeline must
slice to event windows and publish only those slices. Whole-series publication is
not viable on static hosting.

Station identifiers to confirm: Central Park `72505394728`, and the LaGuardia,
JFK and Newark equivalents are **unverified**.

### Tide gauges, NOAA CO-OPS

**Verified.** The Battery, station `8518750`, 29 to 30 October 2012, returned
six-minute water levels in feet on MLLW, with sigma and quality flags:

```
{"t":"2012-10-29 00:00","v":"7.395","s":"0.075","f":"0,0,0,0","q":"v"}
```

| Property | Value |
| --- | --- |
| Endpoint | `api.tidesandcurrents.noaa.gov/api/prod/datagetter` |
| Products | `water_level`, `predictions`, `high_low` |
| Datum | MLLW selected; datum is explicit and must travel with the value |
| Quality | `q` verified or preliminary, `f` flag quartet |
| Limit | The API caps the span per request, so event windows must be chunked |

Storm surge, which HHC reports as "Peak Surge Level", is the difference between
observed water level and predicted tide. It is a derived value and must be
labeled as one, computed from both products rather than read from a single feed.

The station metadata call filtered by state returned stations outside New York,
so station selection must be done by bounding box and then checked by hand.

### Air quality, EPA

**Verified.** `https://aqs.epa.gov/aqsweb/airdata/daily_aqi_by_county_2012.zip`
returned 200 and 1.63 MB. Pre-generated annual national files, daily AQI by
county, no key required.

County-day is a coarse grain against HHC's air quality charts and maps. Hourly
monitor-level data is available through the AQS API, which requires a free key
and is **unverified**. NYC also runs the Community Air Survey, which is a
seasonal model rather than an event observation and is not a substitute.

### Flood sensors

**Unverified.** NYC's FloodNet sensor network is the likely source. It began
around 2021, so it covers a small and recent slice of the record. Treat as a
late-period-only capability.

## Consequences

### 311 service requests

**Verified by query.** The dataset is split, and the split is a real coverage
problem the current tool does not surface.

| Dataset | Coverage | Rows |
| --- | --- | --- |
| `erm2-nwe9` | 2020-01-01 to present | 22,112,729 |
| `76ig-c548` | 2010 to 2019 | not counted |
| `3rfa-3xsf`, `uzcy-9puk`, `aiww-p3af`, `hy4q-igkk`, `sxmw-f24h`, `sqcr-6mww` | one dataset per year, 2004 to 2009 | not counted |

Three HHC consequence pages rest on 311: no heat or hot water, inland flooding
complaints, and tree emergencies. Reconstructing them before 2020 means joining
across eight datasets whose complaint-type vocabularies and columns change. Any
across-time comparison must state where a vocabulary break falls.

There is no 311 coverage before 2004, so events from 1785 to 2003 can have no
311 consequence by definition. That is not applicable, not missing, and must be
rendered as such.

### Motor vehicle collisions

**Verified by query.** `h9gi-nx95`, 2,269,187 rows, 2012-07-01 to 2026-06-11.
Sandy falls inside the coverage by four months. Every event before July 2012 has
no collision data available, which is again not applicable rather than zero.

### MTA ridership

**Partly verified.** `sayj-mze2`, MTA Daily Ridership and Traffic, begins 2020.
`vxuj-8kew` covers 2020 to 2025. Neither reaches Sandy.

Station-level ridership before 2020 exists only in the MTA turnstile archive,
weekly text files at four-hour audit intervals, roughly 2010 to 2022, which is a
different grain and needs its own normalization. **Unverified.** HHC's stated
grain, subway concourse level excluding transfers and staff, is not reproducible
from either public source without approximation.

### Beach advisories and closures

**Unverified.** NYC DOHMH publishes beach water quality sampling and advisory
data; the catalogue search surfaced New York State beach datasets rather than the
city's, so the correct dataset identifier still has to be found.

### Sanitation

**Partly verified.** DSNY Salt Usage `tavr-zknk` and PlowNYC `rmhc-afj9` are
public. The wider operational metrics HHC shows, spreaders deployed and
residential collection tonnage against the prior year, were not found in the
catalogue and are likely internal.

### Power outages

**Not found.** The User Guide states these come from utilities reporting to the
New York State Department of Public Service, and that a fuller version exists
only under a sensitive data sharing agreement. No public historical dataset at
network or borough grain was found in either the city or state catalogue. This is
the strongest deferral candidate in the tool.

### School attendance

**Not found at the required grain.** The User Guide states the figures were
"provided for the tool by NYC Public Schools". Daily present, absent and released
counts by school are not published. Citywide daily attendance during closure
periods is exactly the value HHC renders as `0 % Absent` for Sandy. Deferral is
the honest outcome unless a public daily series is located.

### Weather alerts and messages

**Verified in part.** The Iowa Environmental Mesonet storm-based warning archive
answered a request for 29 October 2012 with 26 KB of GeoJSON. IEM archives NWS
text products and warning polygons with VTEC identifiers, which reproduces the
NWS half of this page. Notify NYC messages are a separate city feed and are
**unverified**.

## Federal assistance

All figures below come from the OpenFEMA `DataSets` endpoint, requested
12 August 2026. Row counts are national.

| Dataset | Version | Rows | Last refresh | Note |
| --- | --- | --- | --- | --- |
| `PublicAssistanceFundedProjectsDetails` | v2 | 846,977 | 2026-07-21 | Federal share obligated, by applicant and damage category |
| `PublicAssistanceApplicants` | v1 | 199,033 | 2026-07-21 | Applicant type |
| `IndividualsAndHouseholdsProgramValidRegistrations` | v2 | 25,886,797 | 2026-07-27 | Registration grain, large |
| `HousingAssistanceOwners` | v2 | 160,068 | 2026-08-09 | Aggregated by disaster and ZIP |
| `HousingAssistanceRenters` | v2 | 147,944 | 2026-08-09 | Aggregated by disaster and ZIP |
| `NfipClaims` | v3 | 2,724,656 | 2026-08-04 | Current claims dataset |
| `DisasterDeclarationsSummaries` | v2 | 70,188 | 2025-09-25 | Declaration to county linkage |

**Two version traps, both verified.** `FimaNfipClaims` v2 and `FimaNfipPolicies`
v2 both carry a deprecation date of 15 October 2026. Use `NfipClaims` v3 and
`NfipPolicies` v3. Requests to `v1/PublicAssistanceFundedProjectsDetails` and
`v2/FemaWebDisasterDeclarations` return 404 because those datasets sit at v2 and
v1 respectively. The version is part of the source identity and belongs in
configuration.

**NFIP claims, verified for NYC.** A filtered request for `countyCode eq '36047'`
and `yearOfLoss eq 2012` returned 3,583 Brooklyn claims. A sample row carries
`dateOfLoss` 2012-10-29, `amountPaidOnBuildingClaim` 18,579.73,
`occupancyType` 2, `causeOfDamage` "1", and `floodZoneCurrent` null.

Three observations follow. Claims join to an event by date of loss, not by
disaster declaration, which matches the User Guide's note that NFIP applies to
all events rather than only declared ones. Coded fields such as
`causeOfDamage` and `occupancyType` need the published code tables, which are
**unverified**. A null flood zone is a real absence and must not become
"unknown zone" silently.

Assistance dates are approval and obligation dates, not event dates. Public
assistance obligations for Sandy continued for more than a decade, so any figure
must state the date the snapshot was taken.

## Inflation

### BLS CPI-U, New York area

**Verified.** Series `CUURS12ASA0` returned monthly index values through
December 2024 at 338.610 from the public v2 API without a key. This is the
all-items index for New York-Newark-Jersey City, and it is the series already
used in The Pay Gap, which keeps the two projects consistent.

The public API without a registered key is limited to a small number of years
per request and a daily request cap, so the series should be fetched once and
cached rather than queried per page.

Deflating New York dollar losses by a national index would understate them. The
metro series is the correct default, and the base period must be stated in every
label.

## Not usable, and why

| Candidate | Reason |
| --- | --- |
| HHC page scraping in production | The brief forbids a runtime dependency, and the site is server-rendered with a POST-only search |
| Esri radar service | HHC's radar is Iowa Environmental Mesonet imagery inside an Esri viewer; there is no Esri radar dependency to reproduce |
| NEXRAD Level II volumes on AWS | Authoritative but requires volume-scan processing and rendering; the IEM composite already answers the same question at far lower cost |
| National CPI-U | Understates New York losses; the metro series exists |
| 311 before 2004 | No data exists |
