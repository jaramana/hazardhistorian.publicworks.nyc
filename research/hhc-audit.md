# Audit of the NYC Hazard History and Consequence Tool

Audited 12 August 2026 against the live site at `nychazardhistory.com` and the
tool's own User Guide (`/files/NYCEM_User_Guide.pdf`, guide last updated
30 March 2026, 36 pages).

This records what the current tool does, how it is built, where its data appears
to come from, and where it fails. It is an input to the feature and source
matrix, not a design document.

## How the current tool is built

| Layer | What it is |
| --- | --- |
| Server | ASP.NET MVC, server-rendered Razor pages, Kendo UI licensing |
| Search | Full-page `POST /Home/Search`, no query string |
| Tables | DataTables 2.2.2 with the HTML5 export buttons |
| Charts | amCharts 4 |
| Maps | ArcGIS Maps SDK for JavaScript 4.32 |
| Radar tiles | Iowa State University, Iowa Environmental Mesonet |
| Other | jQuery, Bootstrap 5, bootstrap-multiselect, lodash, numeral, html2canvas |

Two findings here matter more than the rest.

**Search state is not addressable.** The event search is a form POST to
`/Home/Search`. The URL never changes, so no filtered result set can be linked,
bookmarked, or cited. Event pages themselves are addressable, at
`/Event/Summary/{id}` and `/Event/Detail/{id}`, so the failure is confined to
the query layer.

**The radar is not an Esri product.** The page prints "Powered by Esri", which
is the map viewer. The imagery comes from `mesonet.agron.iastate.edu`, the Iowa
Environmental Mesonet NEXRAD composite tile archive, through three URL templates
in `/js/map-radar.js`:

```
ridge::USCOMP-N0R-$TIME$   base reflectivity, older archive
ridge::USCOMP-N0Q-$TIME$   base reflectivity, newer archive
nexrad-n0q-$TIME$          current-conditions cache
```

This is a free public service with an open tile interface, so the radar
requirement is reproducible without Esri and without processing NEXRAD Level II
volumes. Coverage is confirmed by direct request in
`research/source-manifest.md`.

## Coverage and scale

| Property | Value |
| --- | --- |
| Events returned by an unfiltered search | 2,431 |
| Earliest event date offered by the date picker | 23 September 1785 |
| Event identifier form | `SW0001`, zero-padded, not chronological |
| Boroughs | Five, as an event attribute |

Event identifiers are not in date order. Sandy is `SW0321` while a 2021 event is
`SW2938`, and the highest identifier seen exceeds the number of rows the search
returns. Any rebuild must treat the HHC identifier as an opaque key, not as a
sortable or dense sequence, and must not assume the search result count equals
the number of events in the system.

The 1785 floor means the record is not a uniform 2000-onward series. Sparse
historical events sit alongside dense modern ones, and the interface currently
gives no signal about which period a user is in or what data can exist there.

## Capability inventory

Each row is a capability the current tool exposes, with its stated provider from
the User Guide where one is given. Triage decisions are made in
`research/feature-source-matrix.md` once sources are verified.

### Discovery

| Capability | Behavior | Provider |
| --- | --- | --- |
| Home search | Hazard multi-select, start and end date, "Explore" | |
| Full search | Adds intensity thresholds, consequence presence, location | |
| Result table | Event ID, date, name, type, critical issues, location, duration | |
| Keyword search | Free-text box over the result table | |
| Export to Excel | DataTables client-side export of the visible result set | |
| Notable events | Three hard-coded cards: Ida, 29 September 2023, Sandy | |

Intensity filters are banded rather than continuous: max temperature, min
temperature, daily rainfall, rainfall rate, snowfall, wind speed, air quality,
and heat index, each offered as fixed ranges such as "41-50 Temperature". A
threshold question from the brief, how many flooding events exceeded a chosen
measurable level, is only answerable through whichever bands the tool happens to
offer.

### Event summary, at `/Event/Summary/{id}`

| Section | Content |
| --- | --- |
| Narrative | Prose account of the event |
| Description | Hazard event type, critical issues, start and end time |
| Media links | Curated news and video links, publisher and headline |
| Activations | NYCEM plans activated, emergency operations center yes or no |
| Safety | Injuries, fatalities |
| Consequences | Icon row |
| Cumulative values | Peak surge, power outages, IA, PA, NFIP, attendance, trees |
| Radar map | Time-stepped reflectivity with speed and transparency controls |
| Storm track map | Track with Saffir-Simpson category coloring, tropical events only |
| Event data | Export |

The narrative text, hazard event type, critical issues, and fatality counts
match the NOAA National Centers for Environmental Information Storm Events
Database in wording and structure. That database is almost certainly the event
spine.

### Event details, at `/Event/Detail/{id}`

One page carrying every observation family: weather station metrics, a station
peak map, seven weather charts, tide gauge readings and map, flood sensor
readings and map, air quality chart and map, and per-section exports. The
in-page navigation lists roughly twenty destinations across the details and
consequence pages combined.

### Consequence pages

| Page | Stated provider | Notes from the guide |
| --- | --- | --- |
| No heat or hot water | 311 | Filterable citywide to neighborhood |
| Inland flooding complaints | 311, routed through DEP | Resident-reported |
| MTA ridership | MTA | Subway concourse level, excludes transfers and staff |
| Vehicle collisions | Collision records | Counts plus injured and killed |
| School attendance | NYC Public Schools, supplied directly | Present, absent, released, by school organization |
| Power outages | Utilities reporting to NYS Department of Public Service | Network level, an enhanced version exists under a data sharing agreement |
| Sanitation metrics | DSNY | Collection change against prior year, spreaders deployed, salt tonnage |
| Tree emergencies | 311 | Service requests and work orders, hanging limb, limb down, tree down |
| Beach advisories and closures | DOHMH | Rainfall-driven and sampling-driven notifications |
| FEMA individual assistance | FEMA | |
| FEMA public assistance | FEMA | Federal share obligated, by applicant type and damage category |
| FEMA NFIP | FEMA | Occupancy, basement, cause, flood zone, elevation |
| Weather alerts and messaging | NWS text products and Notify NYC | Full message text behind a link |

Three of these are supplied to NYCEM rather than published. School attendance is
described as "provided for the tool by NYC Public Schools". Power outages come
from utility reporting to NYS DPS, with the guide stating that a fuller version
exists only under a sensitive data sharing agreement. Sanitation operations
metrics such as salt tonnage and spreader deployment are DSNY operational
records. These are the first candidates for deferral, and the decision belongs
in the matrix rather than here.

## Defects observed

These are recorded because they define what the rebuild must not repeat.

**Missing data is displayed as zero.** On the Sandy summary, School Attendance
reads `0 % Absent`. Schools were closed for the better part of a week. On a
January 2000 extreme cold event, Cumulative Values shows `Peak Surge Level 0 ft`
and `Tree Emergencies 0`, where the correct statement is that neither measure
applies or was collected. Injuries reads `0` for Sandy. This single defect
undermines every aggregate the tool presents, because a reader cannot tell a
measured zero from an absent measure.

**A page contradicts itself.** The Sandy narrative describes power outages
"of more than 2 million". The Cumulative Values panel on the same screen reads
`Power Outages 96,257 customers`. Both numbers may be defensible under different
definitions, customer accounts against people, or a single network report
against a citywide total, but the page offers no definition, no period, and no
source for either, so the conflict reads as an error.

**The consequences panel does not render.** On both events inspected, the
Consequences section of the summary prints two bare letters, `L` and `L`, where
icons are intended.

**No route from a filtered search back to itself.** Because search is a POST,
returning from an event to the result set that produced it depends on browser
history alone. Nothing about the query survives sharing, citation, or a reload.

**Values carry no period, unit basis, or source.** Dollar figures such as
`$7,648,686,000` in public assistance are shown without a basis year, without an
indication of whether they are nominal, and without the obligation date range
they cover.

**Placeholder content is live.** The About page change log contains the entries
"ok here we go" and "Patch note added".

**One page per dataset.** Thirteen consequence pages, each with its own filter
form, apply button, date slider, map, and chart, are reached from a long
in-page menu. Comparing two consequences within one event, or one consequence
across two events, is not supported anywhere. The brief's comparison questions
have no path through the current interface.

## What the current tool does well

Worth preserving in some form.

- The narrative gives an event a human account before any chart appears.
- Curated media links are genuinely useful context and are not reproducible from
  any dataset.
- The distinction between hazard, event, and consequence is explicit and sound.
- Weather station peaks alongside a station map answers a real question quickly.
- Radar is present and time-stepped, and its source is free and open.
- Every consequence page offers an export.

## Immediate implications for the rebuild

1. Missing, not applicable, suppressed, and zero must be four distinct states
   carried in the data itself, not decided at render time.
2. The event spine should be rebuilt from the NOAA Storm Events Database rather
   than inherited, with the HHC identifier retained only as a cross-reference.
3. Radar is reproducible from the Iowa Environmental Mesonet tile archive with
   an open map library, so it is a rebuild rather than a deferral.
4. Query state must live in the URL from the first line of code.
5. The thirteen consequence pages should collapse into one event workspace with
   comparable consequence panels, since their filter, map, and chart structure is
   already nearly identical.
6. Three datasets are supplied to NYCEM rather than published, and the rebuild
   must state plainly where a public reconstruction cannot reach.
