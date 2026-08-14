# Accessibility

What was tested, how, and what was found. This is a record of work done, not a
conformance claim. WCAG conformance has not been formally audited, and the site
does not say it has.

Tested 13 August 2026 against the build of the same date.

## What was tested by tooling

`tools/check_accessibility.py` parses every page and checks the mistakes that
are easy to make and easy to miss: a page with no language, a heading level
skipped, a control with no label, an image with no alternative, a link that says
only "here", a new tab opened without warning. It also checks the scripts for a
live region, for accessible names on generated SVG, and for a reduced-motion
path.

Result: 8 pages, 0 problems.

The rendered document object model was then checked, because most of this site
is built by script and the markup on disk is nearly empty. Rendered through
headless Chrome:

| Check | Result |
| --- | --- |
| Live region present, with role status and polite | Pass |
| Result table carries a caption | Pass |
| Sortable columns expose `aria-sort` on the active column | Pass |
| Sorting is a real button, not a click handler on a heading | Pass |
| Every row checkbox has an accessible name naming its event | Pass |
| Chip list is labelled, and each remove button names what it removes | Pass |
| Absent values carry a written reason, not only a colour | Pass |
| Every cell carries its column name for narrow screens | Pass |
| Current page marked in the masthead | Pass |
| Only `tabindex="-1"` is used, so no element jumps the tab order | Pass |

## What was tested by hand

**Keyboard.** The full query can be built and cleared without a mouse. Tab order
follows the visual order: skip link, masthead, dates, text search, the hazard
and borough disclosures, the filter builder, the chips, the action buttons, then
the table. The filter builder is four controls and a button, all standard form
elements. Sorting is reachable by tab and operated by Enter or Space because the
column heading contains a button rather than a click handler.

The chip list takes focus after a filter is added, so a keyboard user lands next
to the thing they just made rather than at the top of the page.

**Focus visibility.** A single `:focus-visible` rule gives every focusable
element a two-pixel outline with a two-pixel offset, in the accent colour, at
7.1:1 against the page. Nothing suppresses outlines anywhere in the stylesheet.

**Charts and maps.** Every chart has a table beneath it holding the same
numbers, in a disclosure so it does not crowd the page. Every map has one too.
The tide chart carries a summary in its accessible name giving the station, the
period, the range and the peak, so it is not silent even collapsed.

This was tested for real rather than assumed: rendering with WebGL unavailable,
which is what a reader with hardware acceleration off or an older machine gets,
produced a written explanation in place of each map with its table intact.

**Reduced motion.** The stylesheet reduces animation and switches off smooth
scrolling under `prefers-reduced-motion`. The radar loop never plays on its own,
and when started deliberately it steps at 1.4 seconds a frame rather than 0.5
under that preference.

**Colour.** No status is carried by colour alone. An absent value is written out
in words at the same size a number would have been. Hazard chips are tinted by
group and always print their name. Text colours were chosen against measured
contrast: the faint ink is 5.1:1 on the page and 4.7:1 on sunken panels, and
control edges use a darker grey than the hairlines because a control edge carries
meaning and needs 3:1.

**Zoom and narrow screens.** At 375 pixels wide the result table becomes a list
of records, with each cell carrying its column name, because a wide table that
scrolls sideways on a phone hides the column that says what a number is. Wide
content scrolls inside its own container; the page body never scrolls
horizontally.

**Announcements.** Every query change announces the new result count through the
live region, cleared first so an identical repeated count still speaks. Loading,
errors, copying a link, and the comparison limit all announce.

## What was found and fixed

**A silent script failure.** A browser without WebGL threw inside the radar map,
which took the storm track, the evidence table and the page navigation with it.
The reader saw three empty headings. On a site whose whole argument is that an
empty space must explain itself, that was the worst possible failure mode. Each
section now draws independently, and anything uncaught puts a written notice at
the top of the page saying the fault is in the site and not in the data.

**A masked error.** A single promise catch covered both a failed fetch and a
failure while drawing, so a rendering bug reported itself as "no event with that
identifier". Load failure and render failure are now separate paths.

**The page navigation read a hint as part of a heading.** Section headings carry
an explanatory phrase beside them, and the rail was repeating the whole
sentence. It now takes the heading text alone.

## Not tested

- No screen reader was driven end to end. The semantics above were checked in
  the rendered document rather than by listening to VoiceOver, NVDA or JAWS.
  This is the largest gap and the next thing to do.
- No testing with voice control or a switch device.
- No testing at 400 per cent zoom, only at a 375 pixel viewport.
- Colour contrast was reasoned from the chosen tokens rather than measured
  across every rendered combination with a tool.
- The MapLibre controls are the library's own and were not audited.

## If you change something

Keep these, because each one is load bearing.

- An absence is written in words, never left blank and never rendered as a dash.
  A blank cell reads as an oversight and a dash reads as a zero.
- Every chart and every map keeps its table.
- Sorting stays a button inside the heading, with `aria-sort` on the active
  column.
- The live region announces the result count on every query change.
- Nothing suppresses a focus outline.
