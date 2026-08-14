NYC Hazard Historian, full data download
Built 14 August 2026

Two files, two grains.

nyc-hazard-historian-events.csv
  One row per event. An event is a NOAA Storm Events episode, except where
  this project merged episodes by hand; merged_by_project marks those.

nyc-hazard-historian-evidence.csv
  One row per NOAA event record: one hazard type, one place, one time window.
  Join to the events file on event_id.

The two FEMA assistance columns are named for the declaration because that is
what they are obligated against. A declaration can cover several events in this
file, and where it does, the same total appears on each of their rows. The
fema_disasters column holds the declaration numbers: use it to deduplicate
before summing anything, and do not read either column as the cost of a storm.

Every measure has a _status column beside it. Read it before using the value.

  ok          a real reported value
  missing     the source covers this period and published no value
  na          the source cannot cover this period at all, usually because the
              dataset starts later than the event
  suppressed  the publisher withheld it
  censored    the publisher published a bound rather than a value

An empty value cell with status na is not a zero. Nothing in these files
defaults an absence to zero.

Dollars appear twice, nominal as published and adjusted to 2024
using the BLS CPI-U for New York-Newark-Jersey City, series CUURS12ASA0.
Column names state which is which.

Sources, coverage and known limitations are at
https://hazardhistorian.publicworks.nyc/method.html

This project is not affiliated with New York City Emergency Management or the
City of New York. It reconstructs a public record from published sources.
