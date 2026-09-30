# NYC Hazard Historian

[NYC Hazard Historian](https://hazardhistorian.publicworks.nyc) is an independent
[publicworks.nyc](https://publicworks.nyc)
record of New York City hazard events and their documented consequences. It shows
where a figure came from and distinguishes a recorded zero from a figure that was
never collected.

## Data sources

| Source | Used for | Source coverage |
| --- | --- | --- |
| [NOAA Storm Events](https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/) | The event record, descriptions, deaths and damage | From 1950; all types from 1996 |
| [GHCN Daily](https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/) | Daily station weather | Central Park from 1869 |
| [NOAA CO-OPS](https://api.tidesandcurrents.noaa.gov/) | Water levels and predicted tides | The Battery from 1920 |
| [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/) | Radar tiles shown live in the browser | From the 1990s; higher-resolution tiles from 2011 |
| [HURDAT2](https://www.nhc.noaa.gov/data/) | Tropical cyclone tracks | 1851–2025 |
| [OpenFEMA](https://www.fema.gov/about/openfema/data-sets) | Public assistance and flood-insurance claims | Assistance from 1998; claims from 1978 |
| [NYC Open Data](https://data.cityofnewyork.us/) | 311 requests and collisions | 311 from 2004; collisions from July 2012 |
| [BLS New York area CPI-U](https://www.bls.gov/cpi/) | Inflation-adjusted dollar amounts | From 1953 |

The dated [source manifest](research/source-manifest.md) records the sources
examined and those rejected.

## Method and limits

- NOAA episodes are the starting unit. A single weather system can have several
  episodes; a small number of merges, including Hurricane Sandy, are declared in
  the pipeline and labeled on the site.
- A measure carries both a value and a status. Zero, not collected then, not
  reported and not applicable have different meanings. The downloads preserve
  those statuses.
- FEMA assistance belongs to a disaster declaration. One declaration can cover
  several site events, so its total must not be added across those events.
- Storm surge is calculated from observed water level minus predicted tide. Event
  peaks are the highest single daily station readings in an event window. Both are
  labeled as derived.
- Dollar figures show the published nominal amount alongside the New York area
  inflation-adjusted amount.
- NOAA direct and indirect deaths remain separate; they are not added together.

The [method page](https://hazardhistorian.publicworks.nyc/method.html) explains
the joins, measures and known gaps. School attendance, power outages and several
other consequences are absent because a public series at the needed grain was not
found. The City's tool reports 2,431 entries against 2,392 event rows here; the
difference remains unexplained. The
[verification record](research/verification.md) also documents the unresolved
difference in Sandy death counts.

## Updates

The site serves a checked-in data snapshot. The Python pipeline in `run.py` can
rebuild it, but there is no scheduled refresh; the GitHub workflow runs on demand.
Validation blocks publication when source shape or data checks fail. The site
reports its build date and coverage.

MapLibre is included with the site. Radar tiles from Iowa and basemap imagery
from the City of New York are requested when a map is used; those views report
an unavailable service rather than treating a blank map as an empty record.

## Tools

Data pipeline: Python's standard library joins and validates source data in
five stages. Website: static HTML, CSS and JavaScript, served from GitHub
Pages, with MapLibre GL for maps, City of New York basemaps, Natural Earth
land outlines and Iowa radar tiles. `tools/make_land.py` builds the land file.
Claude was used in development.

## License and reuse

Code is [BSD 3-Clause licensed](LICENSE). Compiled data can be reused with
attribution; the federal and City source data retain their own terms. Carry a
figure's status and period when republishing it.
