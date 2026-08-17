# Mock-ups and reference conventions

Two separate inputs, recorded together because both constrain design without
prescribing it. The mock-ups are historical requirement statements from previous
vendor conversations. The reference repositories are the house style the new
project should sit beside.

## Mock-ups

Five dated sets in `Mockups/`, from October 2024 to June 2025. They are read for
intent, not layout.

| Set | Format | What it argues for |
| --- | --- | --- |
| 2024-10-04 | Illustrator plus PNG | Earliest layout attempt |
| 2025-02-04 | WSP designer PNGs | Home, summary, details, beach advisories |
| 2025-02-07 | Copy of the October set | No new content |
| 2025-03-31 | Illustrator, splash screens, radar | Radar given its own attention |
| 2026-06-09 | Generated images plus Adobe XD and ChatGPT links | Filter grammar |

### The one requirement stated more clearly than anywhere else

The June 2025 set shows an **Add Characteristic Filter** control. A filter is
built from four parts, then collapses into a removable chip:

```
Characteristic   Operator   Value(s)   Unit
Temperature      Between    32, 55     °F      →  [ Temperature 32°F-55°F  × ]
Rainfall         ≥          0.5        inches  →  [ Rainfall ≥ 0.5 in      × ]
```

This is the answer to the brief's threshold question, and it is what the live
tool's fixed bands were approximating. Three properties matter and should
survive into the implementation.

- The unit is part of the filter, shown to the user, not implied.
- Each filter is independently removable, so a query is reversible one step at a
  time rather than only resettable.
- The chip form is compact enough to stay visible beside the results, which is
  what keeps the active query in view.

It also maps cleanly onto a URL grammar, which is the requirement the current
tool fails outright. A chip list is a repeated query parameter, so the share
link and the visible query are the same object rather than two things that can
drift apart.

### Other intent worth keeping

- **Row selection for comparison.** The result table carries a checkbox column
  labeled Select. Comparison was always meant to start from the result set.
- **Persistent event context.** The WSP summary keeps a left rail naming the
  event and listing its consequence sections, with an on-this-page rail on the
  right. The intent is that a reader never loses which event they are inside.
  The rail itself is a symptom of thirteen separate pages, so keep the intent
  and drop the mechanism.
- **A restricted-data marker.** The WSP left rail puts a lock icon beside Inland
  Flood Complaints. The requirement to mark data the public cannot see was
  understood in 2025. This project inverts it: what cannot be published publicly
  is deferred and named in the documentation, not locked in the interface.
- **Open Data as a top-level destination.** The WSP header lists it beside About
  and Resources. The live tool dropped it.

### What not to carry forward

- The teal-on-navy government header, which the brief rules out for independence
  reasons as much as visual ones.
- Placeholder inconsistency in the mock-ups themselves, such as a Sandy narrative
  under an Ida heading, or an event dated 3/14/1993 named "January 2003 North
  American Blizzard". These are artifacts of mock-up production.
- Stacked empty map panels. Two large grey rectangles for radar and storm track
  appear on an event that has neither.

## Reference repository conventions

From `paygap.publicworks.nyc` and `schools.publicworks.nyc`.

### Shape

| Convention | Both repositories |
| --- | --- |
| Site directory | `docs/`, served by GitHub Pages, with `CNAME` and `.nojekyll` |
| Pipeline | Numbered stages, `00_config` through `04_export` |
| Runner | A single `run.R` or `run.py` at the root |
| Configuration | Every tunable in stage `00`, nothing hard-coded downstream |
| Site code | One JavaScript file per page, plus shared search, table and format helpers |
| Data | Generated JSON under `docs/data/`, downloads under `docs/downloads/` |
| Research | `research/` holds the source manifest and inventories |
| License | BSD 3-Clause for code, attribution for compiled data |
| Framework | None. No build step for the site |

Schools adds `pipeline/03_validate.py` between normalize and export, and its
export stage refuses to run if validation failed. Hazard Historian has more
sources, more grains and more opportunities to silently corrupt a figure, so the
validate stage is not optional here.

Schools also writes into `build/staging/` and moves files into place in one step,
so a failed build cannot leave the published site half-updated.

### Prose

Both READMEs state what the thing is, then what the data will not support, in
the same voice. Some habits worth naming because they are easy to lose:

- No em dashes. Colons introduce labels or genuine lists, not rhetorical pauses.
- The limitation is stated in the same breath as the capability, rather than
  quarantined in a caveats section.
- Rules the pipeline keeps are written down as rules, with the reason, so a later
  change knows what it is breaking. Schools' "Join on the DBN, never on a school
  name" is the model.
- Credit is factual and brief. Tools are named, not thanked.
- No self-promotion, no comparison to other products, no claim of completeness.

### What must be designed fresh

Both reference sites answer a question about one entity: a school, a job title.
Hazard Historian answers questions about events, their consequences, their
geography and their cost, across time and across events. The profile-and-compare
structure those repositories use will not carry it. Navigation, the filter
system, the event workspace and the comparison view are first-principles work,
as the brief states. The pipeline shape, the configuration discipline, the
validation gate and the prose voice all carry over unchanged.
