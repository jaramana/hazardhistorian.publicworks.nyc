# Verification

What was checked before release, how, and what it showed. Everything below was
run on 13 August 2026 against the build of that date. Where something was not
tested, it says so rather than being left out.

## Facts checked against sources outside this project

These matter most, because a pipeline can be internally consistent and still
wrong about the world.

| Fact | This build | Published record | Result |
| --- | --- | --- | --- |
| Sandy peak water level, The Battery | 14.05 ft MLLW, 30 Oct 2012 01:24 UTC | NOAA reports 14.06 ft | Agrees |
| Sandy peak surge, derived | 9.33 ft | NOAA reports about 9.4 ft | Agrees |
| Sandy federal public assistance | $5.69 bn | The largest in the record, as expected | Consistent |
| Sandy NFIP claims | 16,214 claims, $1.28 bn paid | Brooklyn alone returns 3,583 claims for 2012 on direct query | Consistent |
| Sandy direct deaths | 45 | The city's own tool reports 43 | **Differs, unresolved** |
| Ida event rainfall | 8.44 in | Record daily rainfall widely reported for 1 Sept 2021 | Consistent |
| NYC land records in Storm Events | 2,097 | Independently counted from the raw archive | Agrees |
| Event rows including New York Harbor | 2,392 | The city's tool reports 2,431 entries | **Differs by 39, unexplained** |

Both differences are stated on the method page rather than reconciled silently.

## Correctness bugs found and fixed during verification

Each of these produced a wrong or missing figure on a rendered page. They are
recorded because the fix is only half the value; the other half is knowing which
mistakes this kind of work invites.

**Pandemic money attached to storms.** FEMA's COVID-19 declarations carry an
incident period from January 2020 to May 2023. Matching a declaration to an
event by overlapping incident period attached them, and their public assistance,
to every storm for three years. Hurricane Ida showed $10.77 bn of public
assistance, almost all of it pandemic funding. Fixed by requiring a weather
incident type and an incident period short enough to be about one storm. Ida now
reads $551 m from its own two declarations. A validation check now fails the
build if a declaration with a long incident period is ever attached again.

**One script error emptied half a page.** Without WebGL, the radar map threw and
took the storm track, the evidence table and the page navigation with it, leaving
three empty headings. On this site an empty heading reads as "nothing was
recorded". Each section now draws independently, maps degrade to their tables,
and anything uncaught says so at the top of the page.

**Every page would have failed to load.** Two scripts each declared the shared
namespace with `const` at the top level of the same global scope, which is a
syntax error in a browser. Caught by the smoke test before it was ever seen.

**A masked error.** A single promise catch covered both a failed fetch and a
failure while drawing, so a rendering bug reported itself to the reader as "no
event with that identifier".

**Storm tracks were hidden from the storm that needed them.** Tracks were only
matched for events NOAA typed as tropical cyclones. Sandy is filed as coastal
flooding and high wind, so it had no track. Now every event is offered a track
and the test is whether a best-track position falls near New York inside the
event window. 86 events have one.

**Paragraphs ran together.** The source separates narrative paragraphs with a
double pipe rather than a blank line, so every narrative rendered as one wall of
text.

**Unusable event identifiers.** Grouping rows with no episode identifier
produced synthetic keys built from timestamps, which put colons into file names
and query strings. The site's own identifier check would have refused to load
those events entirely. The key is now a short digest, and validation fails the
build if any identifier is not safe in a URL and a file name.

**A reason nobody could see.** An absent value showed the phrase "not collected
then" with the specific reason available only on hover and to screen readers.
"Not collected then" and "no federal declaration for this event" are different
facts, and a reader should not need a mouse to tell them apart. The reason is
now printed under the value everywhere except the result table, where ten
columns of sentences would drown the numbers.

**One blizzard, fourteen events.** Found through a validation check, and
deliberately not fixed. The Weather Service split the Blizzard of 1996 into
fourteen episodes of its own. Grouping them would mean overruling the source
about its own record, so the check now warns instead of failing, and the reason
is written down in `research/profile-storm-events.md`.

## Data integrity

The value model was tested rather than trusted. Across the whole build:

| Status | Measures |
| --- | --- |
| Reported | 29,974 |
| Not collected then | 5,650 |
| Not reported | 1,634 |

Validation fails the build if any measure carries a status that is not declared,
if a measure marked absent carries a value, if a measure marked reported carries
none, or if not one measure in the entire build is marked not applicable. That
last check exists because losing the distinction would look exactly like a clean
build.

The smoke tests in `tools/check_site.js` load the site's own scripts against the
real exported data and assert the rule directly: 117 checks, 0 failures. Among
them, that no absent status ever renders as a digit, that a real zero renders as
zero and is not styled as an absence, that an absent measure sorts as null rather
than as zero, and that events with no value for a measure are excluded from a
threshold filter rather than treated as low. The last one is tested against
surge and damage, not rainfall, because the Central Park rainfall record is
unbroken across the whole archive and so cannot demonstrate the rule.

## The download agrees with the site

41 events were checked cell by cell across five measures, comparing the
consolidated CSV against the JSON the pages read, including both the value and
its status column. 0 mismatches. The two files cover exactly the same 906
events.

This is structural rather than lucky: the site data, the per-event files and the
downloads are written from the same objects in one pass.

## Reproducibility

`build/`, `docs/data/` and `docs/downloads/` were deleted and the pipeline rerun
from the cached sources. The regenerated index and both CSV files were
byte-identical to what had been there before, checked by SHA-256.

A full run from nothing, re-downloading every source, has not been repeated end
to end since the sources were first fetched. The fetch stage is cache-aware and
checks what arrives, but a true cold run is untested in this form.

## Performance

Served compressed, as GitHub Pages serves it.

| Asset | Transferred |
| --- | --- |
| Explorer page | 1.4 KB |
| Stylesheet | 5.1 KB |
| Shared and page scripts | 12.7 KB |
| Event index, all 906 events | 41.2 KB |
| One event's full record | 9.0 KB |
| Site metadata | 4.1 KB |
| MapLibre, event pages only | 211.5 KB |

A first visit to the explorer transfers about 60 KB and then filters entirely in
the browser, so a query change costs nothing at all. The map library is the
largest single asset by far and is loaded only on event pages, where a map is
the point.

Not measured: real-world load time over a slow connection, memory use on an old
device, and rendering time for the largest event.

## Browser behaviour

Rendered and inspected in headless Chrome 140 at desktop and at a 375 pixel
viewport. Every page renders with no script errors. The 404 page returns a real
404 status, both locally and in the GitHub Pages configuration.

Not tested: Safari, Firefox, and any mobile browser. The site uses no framework
and nothing newer than optional chaining, but that is an argument rather than a
test.

## What has not been verified

- No screen reader was driven end to end. See `research/accessibility.md`.
- No cold run of the full pipeline from an empty cache.
- No browser other than Chrome.
- The Iowa Environmental Mesonet's stated terms of use have not been read and
  agreed against the way this site uses their tiles. This should happen before
  the site is public.
- Radar frames were verified as loading for one event, not swept across the
  archive, so the exact date at which the older product stops and the newer one
  starts is still approximate.
- The 39 event difference against the city's tool is unexplained.
- The Sandy death count difference against the city's tool is unexplained.
