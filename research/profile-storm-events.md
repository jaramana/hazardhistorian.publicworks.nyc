# Profile: NOAA Storm Events, New York City subset

All 77 annual detail files were downloaded on 12 August 2026, 314 MB compressed,
and filtered to New York City. Every figure below comes from the data itself.

## How New York City is identified

Storm Events records a location as either a county (`CZ_TYPE` = `C`) or a
National Weather Service forecast zone (`CZ_TYPE` = `Z`). New York City appears
as both, and which one is used depends on the event type. Filtering on county
FIPS alone loses most winter, heat and wind events.

| Type | Code | Name in the data | Borough |
| --- | --- | --- | --- |
| C | 005 | BRONX | Bronx |
| C | 047 | KINGS | Brooklyn |
| C | 061 | NEW YORK | Manhattan |
| C | 081 | QUEENS | Queens |
| C | 085 | RICHMOND | Staten Island |
| Z | 072 | NEW YORK (MANHATTAN) | Manhattan |
| Z | 073 | BRONX | Bronx |
| Z | 074 | RICHMOND (STATEN IS.) | Staten Island |
| Z | 075 | KINGS (BROOKLYN) | Brooklyn |
| Z | 076 | QUEENS | Queens |
| Z | 176 | NORTHERN QUEENS | Queens |
| Z | 178 | SOUTHERN QUEENS | Queens |

**The zone scheme changed during the record.** Queens was a single zone, `Z076`,
with 102 rows, and was later split into `Z176` Northern Queens with 121 rows and
`Z178` Southern Queens with 139 rows. Two consequences follow. Queens can appear
twice in one episode, so counting rows per borough double counts it, and any
sub-borough geography is available for Queens in the later period only. Borough
is the honest common grain across the whole record.

This mapping belongs in configuration, not in code, because it is a judgment that
a future reader must be able to check.

## Volume and coverage

| Measure | Value |
| --- | --- |
| Event rows in New York City | 2,097 |
| Distinct `EVENT_ID` | 2,097, so the row is the event |
| Distinct `EPISODE_ID` | 667 |
| Rows carrying no `EPISODE_ID` | 82 |
| First year present | 1958 |
| Last year present | 2026 |

Rows by decade:

| Decade | Rows |
| --- | --- |
| 1950s | 1 |
| 1960s | 9 |
| 1970s | 6 |
| 1980s | 31 |
| 1990s | 309 |
| 2000s | 636 |
| 2010s | 697 |
| 2020s | 408 |

The record is not a uniform series. It is 47 rows before 1990 and 2,050 after.
The step at 1996, when all event types began to be recorded rather than tornado,
hail and wind alone, is visible in the 1990s figure. The site must show this
rather than let a user read a trend out of a change in what was collected.

Event types, the largest of 26:

| Type | Rows |
| --- | --- |
| Thunderstorm Wind | 407 |
| Flash Flood | 396 |
| High Wind | 167 |
| Heavy Snow | 166 |
| Strong Wind | 117 |
| Winter Weather | 114 |
| Winter Storm | 107 |
| Heavy Rain | 91 |
| Flood | 87 |
| Coastal Flood | 82 |

Storm Events uses 26 types where the current tool offers 14 hazards. The mapping
from one to the other is a project transformation and must be published.

## What an event is

This is the central modelling question, and the data answers it clearly.

**A row is one event type in one place.** January 2000 contains five rows for a
single cold spell, one per borough, all sharing `EPISODE_ID` 1090039, all running
17 January 02:00 to 18 January 10:00. The direct death count is carried on the
borough rows: one in Brooklyn, two in Queens.

**An episode is one weather system.** The four January 2000 episodes correspond
exactly to the first four events the current tool lists, `SW0001` to `SW0004`.
The current tool's event is the Storm Events episode.

**An episode is not always the whole storm.** Sandy occupies two episodes in the
same window: `70044` Coastal Flood, six rows, and `68867` High Wind, six rows.
The current tool presents these as one event, `SW0321`, with critical issues
"Coastal Flooding, High Winds". Merging them was a curatorial act, not a
property of the source.

So the model needs three levels, and the third must be labeled as
project-derived:

| Level | Source | Grain |
| --- | --- | --- |
| Observation | NCEI event | One event type, one borough, one time window |
| Episode | NCEI `EPISODE_ID` | One weather system as the Weather Service grouped it |
| Event | This project | One or more episodes, merged by a published rule, optionally named |

Merging every episode whose window overlaps another gives these counts:

| Merge gap | Resulting events |
| --- | --- |
| 0 hours, overlap only | 982 |
| 6 hours | 614 |
| 12 hours | 603 |
| 24 hours | 575 |

A pure time merge is too blunt. It would join unrelated systems in a busy week
and it drops from 982 to 614 events on a six-hour change, which is far too
sensitive for a structural decision. The recommendation is to keep the episode as
the default event, merge only where episodes overlap in time **and** the merge is
listed in a small, published exceptions file naming the storm, and carry the
82 episode-less rows as single-episode events. That keeps the derived layer small
enough to audit by hand.

## Reconciliation against the current tool

The current tool reports 2,431 entries. The New York City land subset is 2,097
rows. The marine zone hypothesis was tested and closes most of the gap.

| Component | Rows |
| --- | --- |
| New York City land, county and zone records | 2,097 |
| `NEW YORK HARBOR` marine zone, `Z338` and `M338` | 295 |
| Subtotal | 2,392 |
| Reported by the current tool | 2,431 |
| Unexplained | 39 |

The marine zone record begins in 2002 and covers New York Harbor, which is
inside the city's waters. Including it is defensible for coastal events and is
the likely reason the current tool's count exceeds the land subset. Other nearby
marine zones, such as Fire Island Inlet to Sandy Hook with 199 rows, lie outside
the city and should not be included.

The residual 39 is consistent with a small set of pre-1950 historical entries,
given the tool offers dates from 23 September 1785 while Storm Events begins in
1950, but that is **not confirmed**. It remains an open item, and it is small
enough that it can be resolved by comparing event lists directly once the
canonical table exists.

One normalization trap found while testing this. The same marine zone appears as
both `NEW YORK HARBOR` and `New York Harbor` in `CZ_NAME`, in different years.
Case-sensitive name matching would silently drop records. Match on `CZ_TYPE` and
`CZ_FIPS`, never on the name, which is the same rule the Schools Finder
repository states for school identifiers.

## Data quality found in the source

| Finding | Count |
| --- | --- |
| Rows with no property damage value | 790 of 2,097 |
| Rows with a magnitude value | 733 of 2,097 |
| Rows with begin coordinates | 827 of 2,097 |
| Rows with a flood cause | 306 of 2,097 |
| Rows with a reporting source | 1,804 of 2,097 |
| Rows with an end time before the begin time | 0 |

Blank is the dominant state for damage, magnitude and coordinates. Rendering any
of these as zero, or plotting only the 827 rows with coordinates without saying
so, would repeat the defect this project exists to fix.

Damage values parse cleanly. All non-blank values match the `123.45K` form with
a K, M or B suffix, and no unparsable value was found. The largest single-row
property damage in the subset is 60,000,000 dollars, nominal, in the year the row
belongs to.

Deaths across the whole subset are 246 direct and 9 indirect. These are different
measures and must not be summed. The Sandy window carries 45 direct deaths across
its twelve rows, against the 43 the current tool reports on its summary page.
That discrepancy needs an explanation before either figure is published.

## Two refinements found during implementation

Both changed the event count, so they are recorded here rather than only in the
code.

**Rows with no episode identifier are grouped by hazard and window.** The
original rule made each of the 82 episode-less rows its own event. Where several
of those rows share a hazard and an identical begin and end time, they are one
weather system, and grouping them on an exact match introduces no tolerance and
no judgment. This took the build from 917 events to 906.

**The episode identifier is not always a grouping.** In 1985, 1992 and 1994 the
source issues one episode per event row, so the identifier carries no
information at all. The Blizzard of 1996 is a sharper case: the source splits it
into fourteen episodes, five boroughs of winter storm, four of coastal flooding
and five of inland flooding, each with its own episode identifier.

That last one was tempting to fix and should not be fixed. Grouping those
fourteen would mean deciding that the Weather Service was wrong about its own
record. The site shows them as the source published them, and the validation
warns rather than fails when one federal declaration covers many events, because
that pattern is the source splitting a storm rather than an error in the join.

## Decisions this profile settles

1. Borough is the common geographic grain. Sub-borough detail exists for Queens
   in the later period only and cannot be offered uniformly.
2. The event is the episode, with a small published exceptions file for merges
   such as Sandy. The merge rule is project-derived and labeled.
3. The zone and county mapping, the event-type to hazard mapping, and the merge
   exceptions all live in configuration.
4. Coverage before 1990 is too thin to support trend claims, and coverage before
   1996 is not comparable to what follows.
5. The 2,431 against 2,097 gap is an open reconciliation item, and marine zones
   are the first hypothesis to test.
