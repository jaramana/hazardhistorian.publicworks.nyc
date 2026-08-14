# Feature and source matrix

Every capability in the current Hazard History and Consequence Tool, mapped to
its purpose, its likely source, the public source that would replace it, and a
decision.

Decisions use the brief's four outcomes.

| Decision | Meaning |
| --- | --- |
| **Rebuild** | Useful and reproducible from public data |
| **Redesign** | The information matters, the current interaction does not work |
| **Defer** | Real value, but the data or the effort is not viable for the first release |
| **Omit** | A dead end, duplicative, misleading, or not worth the complexity |

Evidence for the current behavior is in `research/hhc-audit.md`. Evidence for the
sources, including what was verified by request and what was not, is in
`research/source-manifest.md`. Nothing here is decided on a source that has not
been checked; where a source is unverified the decision reflects that
uncertainty rather than assuming success.

## Discovery and search

| Capability | User purpose | Current behavior | Public source | Decision | Notes |
| --- | --- | --- | --- | --- | --- |
| Event search by hazard and date | Find events of a type in a period | Form POST, no URL state | NCEI Storm Events | **Redesign** | Same question, answered in the URL, with results updating as filters change |
| Intensity filters | Find events above a measurable level | Fixed bands such as "41-50 Temperature" | NCEI LCD peaks per event | **Redesign** | Continuous thresholds instead of bands; the brief asks for events above a chosen level, which bands cannot answer |
| Consequence presence filter | Find events that produced a given impact | Dropdown of thirteen consequence types | Derived from consequence tables | **Rebuild** | Must distinguish "no impact recorded" from "this dataset does not cover this period" |
| Location filter | Limit to a borough | Borough multi-select | NCEI county FIPS, consequence geography | **Rebuild** | Borough is the honest common grain; finer geography only where a dataset supports it |
| Result table | Scan and compare candidates | DataTables, ten rows by default, keyword box | Canonical event table | **Rebuild** | Keep the table, add the query to the URL, add sort by consequence magnitude |
| Export the result set | Take the query away | Client-side Excel export of visible rows | Canonical data | **Rebuild** | Export the query result, not the rendered page |
| Notable events | Offer a way in | Three hard-coded cards | Curated list in configuration | **Rebuild** | Keep it small and name it as an editorial choice |

## Event summary

| Capability | User purpose | Current behavior | Public source | Decision | Notes |
| --- | --- | --- | --- | --- | --- |
| Narrative | Understand what happened in prose | Full narrative text | NCEI `EPISODE_NARRATIVE`, `EVENT_NARRATIVE` | **Rebuild** | Attribute to the National Weather Service; it is a source fact, not project text |
| Hazard type and critical issues | Classify the event | Two labels | NCEI `EVENT_TYPE` grouped into episodes | **Rebuild** | The mapping from event types to hazard categories is a documented project transformation |
| Start and end time | Bound the event | Local time, no zone stated | NCEI begin and end date-time | **Rebuild** | State the time zone; observation windows depend on it |
| Media links | Read contemporary accounts | Curated publisher and headline list | None; editorial | **Rebuild** | Not reproducible from any dataset, and genuinely valuable. Carry forward as curated project content, clearly marked, with link rot checked at build time |
| Activations | See the city's response posture | Plans activated count, EOC yes or no | Not public | **Defer** | NYCEM operational record. Document the gap rather than approximating it |
| Injuries and fatalities | Human cost | Counts, zero when absent | NCEI direct and indirect deaths and injuries | **Rebuild** | Direct and indirect are different measures and must not be summed silently. Absent is not zero |
| Consequences icon row | See at a glance what happened | Renders as two bare letters | Derived | **Redesign** | Replace with a legible summary of which consequence datasets have records, and which do not cover the period |
| Cumulative values | Headline totals | Mixed panel, zeros for missing | Several, per row below | **Redesign** | Every figure needs a period, a unit, a basis, and a source beside it |
| Peak surge level | Coastal severity | Single figure in feet | CO-OPS observed minus predicted | **Rebuild** | A derived value. Label it as derived, state the datum and the station |
| Radar map | See the storm move | Time-stepped tiles in an Esri viewer | Iowa Environmental Mesonet composite tiles | **Rebuild** | Verified back to 2000. Move to MapLibre. Select N0R or N0Q by date |
| Storm track map | See the track and intensity | Track with category colors | HURDAT2 | **Rebuild** | Tropical events only, which is correct. Show nothing rather than an empty map elsewhere |
| Event export | Take the event away | Per-page export | Canonical data | **Rebuild** | One event bundle, plus the consolidated download |

## Observations

| Capability | User purpose | Current behavior | Public source | Decision | Notes |
| --- | --- | --- | --- | --- | --- |
| Weather station metrics | Peak conditions during the event | Seven headline peaks | NCEI LCD hourly | **Rebuild** | Peaks are derived from hourly data over the event window; publish the window with the peak |
| Weather station map | Where conditions were worst | Peak value per station | NCEI LCD plus station coordinates | **Rebuild** | Station coverage varies over the record and the map must show which stations reported |
| Weather charts | Conditions over time | Seven separate charts | NCEI LCD hourly | **Redesign** | One chart with a measure selector rather than seven stacked charts, most of which are empty for most events |
| Tide gauge readings and map | Water level during the event | Table and map | CO-OPS six-minute water level | **Rebuild** | Carry the datum. Observed and predicted are different series and must be distinguishable |
| Flood sensor readings and map | Street-level flooding | Table and map | FloodNet, unverified | **Defer** | The network starts around 2021, so it covers a small recent slice. Revisit once verified |
| Air quality chart and map | Air quality during the event | Time series and map | EPA daily AQI by county, verified; hourly AQS unverified | **Redesign** | County-day is coarser than the current chart implies. Publish at the grain the source supports and say so |

## Consequences

| Capability | User purpose | Current behavior | Public source | Decision | Notes |
| --- | --- | --- | --- | --- | --- |
| No heat or hot water | Cold-event housing impact | 311 counts, filterable to neighborhood | 311, eight datasets, 2004 onward | **Rebuild** | Not applicable before 2004. Complaint vocabulary changes across the splits |
| Inland flooding complaints | Where flooding was reported | 311 counts routed via DEP | 311, same split | **Rebuild** | Resident-reported, so it measures reporting as well as flooding. Say so on the page |
| Tree emergencies | Wind damage | 311 requests and work orders, time-lapse map | 311, same split | **Rebuild** | Requests and work orders are different counts and must not be added together |
| Vehicle collisions | Road safety impact | Counts, injuries, fatalities | `h9gi-nx95`, verified, from July 2012 | **Rebuild** | Nothing before July 2012. That is not applicable, not zero |
| MTA ridership | Service and travel disruption | Subway concourse level | Daily citywide from 2020; turnstile archive 2010 to 2022, unverified | **Defer** | Neither public source reproduces the stated grain across the record. A citywide daily series from 2020 is a smaller, honest capability, and is the fallback if deferral is later reconsidered |
| School attendance | Disruption to children and families | Percent absent by school organization | Not published at daily grain | **Defer** | Supplied to NYCEM by NYC Public Schools. The current tool prints `0 % Absent` for Sandy, which is the clearest single argument for deferring rather than approximating |
| Power outages | Scale of loss of service | Customers affected at network level | Not found in city or state catalogues | **Defer** | Utility reporting to NYS DPS under a data sharing agreement. The current page also contradicts its own event narrative by a factor of twenty |
| Sanitation metrics | Snow response effort | Collection change, spreaders, salt tonnage | DSNY Salt Usage and PlowNYC are public; the rest is not | **Defer** | Partial reconstruction is possible and is worth a later release. Publishing two of six metrics under the same heading would mislead |
| Beach advisories and closures | Recreational water safety | Advisories by type and location | DOHMH dataset not yet identified | **Defer** | Decide once the dataset is verified. Do not build against an assumed identifier |
| Weather alerts and messages | What warnings were issued | NWS text products and Notify NYC | IEM warning archive verified; Notify NYC unverified | **Rebuild**, NWS only | Warnings are the strongest available signal of what the city was told and when. Omit Notify NYC until verified |

## Federal assistance

| Capability | User purpose | Current behavior | Public source | Decision | Notes |
| --- | --- | --- | --- | --- | --- |
| FEMA public assistance | Cost of public recovery | Federal share obligated, by applicant and category | `PublicAssistanceFundedProjectsDetails` v2, verified | **Rebuild** | Obligation dates run for years past the event. State the snapshot date beside every total |
| FEMA individual assistance | Aid to households | Total individual assistance | `HousingAssistanceOwners` and `HousingAssistanceRenters` v2, verified | **Rebuild** | Prefer the aggregated housing datasets over the 25.9 million row registration file. Owners and renters are separate populations |
| FEMA NFIP | Insured flood loss | Claim values by occupancy, zone, cause | `NfipClaims` v3, verified, 3,583 Brooklyn claims for 2012 | **Rebuild** | Join on date of loss, not on declaration. Coded fields need the published code tables |
| Disaster declarations | Which events were declared | Implicit | `DisasterDeclarationsSummaries` v2, verified | **Rebuild** | New capability. It explains why one event has assistance and another does not, which the current tool never states |
| Nominal and adjusted dollars | Compare across decades | Nominal only, no basis stated | BLS `CUURS12ASA0`, verified | **Rebuild** | Both figures, always labeled. Metro series, not national |

## Cross-cutting

| Capability | Decision | Notes |
| --- | --- | --- |
| Shareable query URLs | **Rebuild** | Absent today. Required by the brief and by the completion criteria |
| Event comparison | **Rebuild** | Absent today. Two or more events across weather, impacts, geography and assistance |
| Trend exploration across events | **Rebuild** | Absent today. Only answerable once consequences are comparable across events |
| Consolidated data download | **Rebuild** | Today's exports are per page and client-side. One canonical download, agreeing with the site |
| Provenance beside every value | **Rebuild** | Absent today. Source, period, unit and basis travel with the number |
| One page per dataset | **Omit** | Thirteen near-identical consequence pages collapse into one event workspace |
| Separate enhanced version | **Omit** | Depends on restricted data and cannot exist in a public project |
| Placeholder change log | **Omit** | |

## Deferred and omitted log

Recorded so the reason survives the decision.

### Deferred

| Capability | Why | What would change it |
| --- | --- | --- |
| School attendance | Daily attendance by school is not published | A public daily series, or an accepted citywide substitute |
| Power outages | Utility data reaches NYS DPS under a sharing agreement | A public historical outage series at borough grain or finer |
| Sanitation operations | Only salt usage and plow data are public | Publication of collection and deployment metrics, or a narrower page that claims only what salt data supports |
| MTA ridership | No public source matches the stated grain across the record | Accepting a citywide daily series from 2020, or normalizing the turnstile archive |
| Flood sensors | FloodNet is recent and unverified | Verification of coverage and terms |
| Beach advisories | The DOHMH dataset has not been identified | Finding and verifying it, which is a small task and may move this to rebuild |
| NYCEM activations | Operational records are not published | Publication, which is unlikely |
| Events before 1950 | Storm Events begins in 1950, and all types only from 1996 | A documented historical source for the 1785 to 1949 entries |
| Notify NYC messages | Feed and archive not verified | Verification |

### Omitted

| Capability | Why |
| --- | --- |
| One page per dataset | The structural defect the rebuild exists to fix |
| Fixed intensity bands | Continuous thresholds answer the question the bands were approximating |
| Esri viewer and basemaps | An open library and open basemaps do the same work at no cost |
| Restricted enhanced version | Cannot exist in a public project |
| Client-side page exports | Superseded by canonical downloads that agree with the site |

## As built

The triage above was written before implementation. Everything marked rebuild or
redesign was built, with three changes worth recording.

**Air quality was deferred after all.** EPA publishes county-day AQI, which was
verified and is coarser than the event charts the current tool shows. It is not
on event pages in this release. Publishing a county-day figure inside an event
timeline would imply a resolution the source does not have.

**Storm tracks reach further than planned.** The intention was tropical events
only. Sandy is filed by NOAA as coastal flooding and high wind, so a hazard-type
gate would have hidden the track from the one event that most needs it. Every
event is now offered a track, and the test is whether a best-track position falls
near New York inside the event window. 86 events have one.

**Weather is daily, not hourly.** The plan named the hourly Local Climatological
Data files. Those run about 7 MB per station-year, roughly two gigabytes across
this record, to support measures the site reports as event peaks anyway. Daily
summaries were used instead. The cost is that rainfall rate and heat index cannot
be derived and are not offered, which is stated on the method page rather than
approximated.

## What this means for the first release

Nine of the thirteen consequence families are rebuildable from verified public
sources. Four are deferred, and three of those four are deferred because NYCEM
receives data that is not published to anyone else. That is a finding about the
public record, not a shortfall in the rebuild, and the site should say so plainly
rather than leaving empty panels where the data never existed.

The two capabilities that most define the current tool's failure, missing values
rendered as zero and a query that cannot be shared, are both fixed in the data
model and the URL rather than in the interface. They should be settled before any
page is designed.

## Refinement, August 2026

Six changes made after the first build, recorded here because each one changed
what a label claims rather than only how it looks.

**Assistance is scoped to its declaration.** FEMA public and housing assistance
was attached to every event whose window overlapped a declaration, and each of
those events printed the declaration's whole total with no indication that it
was shared. DR-1083 is matched to fourteen events. The measure now carries the
declaration numbers and the number of events sharing them, validation fails if
that scope is missing, the explorer's money column was replaced by a count of
declarations, the home page no longer features an event for drawing the most
assistance, and the comparison sheet groups those rows under what they are
obligated against.

**WSF2 is a two-minute wind, not a gust.** GHCN-Daily publishes peak gust as
WSFG, which these four stations do not report. The measure was renamed
`wind_2min` through the pipeline, the site and the downloads.

**Consequence windows are per dataset.** 311 counts run one day past the event,
collisions do not, and the site used to state one window for both. The windows
are declared in `CONSEQUENCE_WINDOWS` and printed by the panel that used them.

**The hazard groups were removed.** Water, Winter, Temperature and Wind were a
presentation invention, filed drought under Temperature, and carried a colour.
The eighteen normalised hazard values are now the whole vocabulary, listed with
their event counts.

**"Not here, and why" left the event pages.** Four datasets are missing from
every event for the same reason each time. Repeating that under nine hundred
events made a property of the record look like a finding about a storm. It is
on the method page, linked from the consequence section.

**Method and data became one page.** They were two pages defining the same
statuses, the same sources and the same dollar basis. `data.html` redirects.
