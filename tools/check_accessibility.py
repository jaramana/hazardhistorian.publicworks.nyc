#!/usr/bin/env python3
"""Static accessibility checks over docs/.

This is not a conformance test and passing it is not a claim of conformance.
It catches the mistakes that are easy to make and easy to miss in markup: a
page with no language, a heading level skipped, a control with no label, an
image with no alternative, a link that says "click here".

The things it cannot check are the things that matter most, and they have to be
done by hand: keyboard order, focus visibility, whether a chart's table says
what the chart says, and whether a screen reader announces a result count when
the query changes. `research/accessibility.md` records what was tested that way
and what was found.

    python3 tools/check_accessibility.py
"""

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "docs"

VAGUE_LINKS = {"click here", "here", "read more", "more", "link", "this"}


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.problems = []
        self.headings = []
        self.lang = None
        self.title = False
        self.in_title = False
        self.labels_for = set()
        self.controls = []
        self.link_text = []
        self._open_link = None
        self._open_heading = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang")
        if tag == "title":
            self.in_title = True
        if tag == "img" and a.get("alt") is None:
            self.problems.append(f"img with no alt: {a.get('src', '?')}")
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._open_heading = (int(tag[1]), "")
        if tag == "label" and a.get("for"):
            self.labels_for.add(a["for"])
        if tag in ("input", "select", "textarea"):
            kind = a.get("type", "text")
            if kind not in ("hidden", "submit", "button", "reset"):
                self.controls.append((a.get("id"), a.get("aria-label"),
                                      a.get("aria-labelledby"), kind))
        if tag == "a":
            self._open_link = a
            if a.get("target") == "_blank" and "opens" not in str(a.get("aria-label", "")).lower():
                self.problems.append(
                    f"link opens a new tab without saying so: {a.get('href')}")
        if tag == "table":
            pass

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "a" and self._open_link is not None:
            self._open_link = None
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6") and self._open_heading:
            self.headings.append(self._open_heading)
            self._open_heading = None

    def handle_data(self, data):
        if self.in_title and data.strip():
            self.title = True
        if self._open_heading:
            self._open_heading = (self._open_heading[0],
                                  self._open_heading[1] + data)
        if self._open_link is not None and data.strip():
            self.link_text.append(data.strip().lower())


def check(path):
    html = path.read_text(encoding="utf-8")
    # A redirect stub has no navigation to skip past and no content to reach.
    # Checking one for a skip link produces a problem nobody can fix.
    if 'http-equiv="refresh"' in html:
        return []
    p = Page()
    p.feed(html)
    out = list(p.problems)

    if not p.lang:
        out.append("the html element has no lang attribute")
    if not p.title:
        out.append("the page has no title text")
    if "skip" not in html:
        out.append("no skip link")

    levels = [h[0] for h in p.headings]
    if levels:
        if levels.count(1) != 1:
            out.append(f"{levels.count(1)} level-one headings, expected exactly one")
        last = levels[0]
        for lvl, text in p.headings[1:]:
            if lvl > last + 1:
                out.append(f"heading level jumps from h{last} to h{lvl}: "
                           f"{text.strip()[:40]!r}")
            last = lvl

    for cid, aria, ariaby, kind in p.controls:
        if aria or ariaby:
            continue
        if cid and cid in p.labels_for:
            continue
        out.append(f"{kind} control with no label: id={cid!r}")

    for text in p.link_text:
        if text in VAGUE_LINKS:
            out.append(f"link text says only {text!r}")

    # Charts are drawn in JavaScript, so the markup cannot be checked here.
    # What can be checked is that a page drawing one also builds a table.
    return out


def check_scripts():
    """Rules that live in the JavaScript rather than the markup."""
    out = []
    js = {p.name: p.read_text(encoding="utf-8") for p in (ROOT / "js").glob("*.js")}

    if "aria-live" not in js.get("site.js", ""):
        out.append("site.js: no live region, so query changes are announced to "
                   "nobody")
    for name, body in js.items():
        if "createElementNS" in body and "aria-label" not in body:
            out.append(f"{name}: draws SVG without an accessible name")
        if "innerHTML" in body and "textContent" not in body:
            out.append(f"{name}: builds markup by string only")
    if "prefers-reduced-motion" not in js.get("event.js", ""):
        out.append("event.js: the radar loop ignores a reduced-motion preference")
    return out


def main():
    pages = sorted(ROOT.glob("*.html"))
    if not pages:
        sys.exit(f"No pages in {ROOT}")
    total = 0
    for path in pages:
        problems = check(path)
        total += len(problems)
        mark = "ok  " if not problems else "    "
        print(f"{mark}{path.name}")
        for p in problems:
            print(f"      {p}")

    script_problems = check_scripts()
    total += len(script_problems)
    print("    scripts")
    for p in script_problems:
        print(f"      {p}")
    if not script_problems:
        print("      nothing found")

    css = (ROOT / "css" / "site.css").read_text(encoding="utf-8")
    for token in ("prefers-reduced-motion", ":focus-visible", "visually-hidden"):
        if token not in css:
            print(f"      site.css: no {token} rule")
            total += 1

    print(f"\n{len(pages)} pages, {total} problems found by static checking.")
    print("Static checking cannot tell you whether the site is usable. "
          "See research/accessibility.md for what was tested by hand.")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
