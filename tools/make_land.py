#!/usr/bin/env python3
"""Writes docs/vendor/land.geojson, the land outline drawn under every map.

The City's basemap tiles cover only the New York area from zoom 8 up. This
file gives the maps a coastline everywhere else: the storm-track map and the
radar map zoomed out. It is Natural Earth's 1:50m land, which is public
domain, clipped to the Atlantic basin and rounded to two decimal places.

Standard library only, matching the rest of this project. Run it again only
to change the source version, the box or the precision.

    python3 tools/make_land.py
"""

import json
import urllib.request
from pathlib import Path

SOURCE = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
          "v5.1.2/geojson/ne_50m_land.geojson")
OUT = Path(__file__).resolve().parent.parent / "docs" / "vendor" / "land.geojson"

# West, south, east, north. Stored tracks run from 96W to 0 and from 9N to
# 63N; the margin keeps the clipped edge far outside any view a reader pans to.
BOX = (-130.0, -10.0, 30.0, 80.0)
PLACES = 2


def clip_ring(ring, box):
    """Sutherland-Hodgman clip of one closed ring against the box."""
    west, south, east, north = box
    edges = [
        (lambda p: p[0] >= west, lambda a, b: cross_x(a, b, west)),
        (lambda p: p[0] <= east, lambda a, b: cross_x(a, b, east)),
        (lambda p: p[1] >= south, lambda a, b: cross_y(a, b, south)),
        (lambda p: p[1] <= north, lambda a, b: cross_y(a, b, north)),
    ]
    pts = ring[:-1] if ring and ring[0] == ring[-1] else ring
    for inside, cross in edges:
        if not pts:
            break
        out = []
        prev = pts[-1]
        for cur in pts:
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
            prev = cur
        pts = out
    return pts


def cross_x(a, b, x):
    t = (x - a[0]) / (b[0] - a[0])
    return [x, a[1] + t * (b[1] - a[1])]


def cross_y(a, b, y):
    t = (y - a[1]) / (b[1] - a[1])
    return [a[0] + t * (b[0] - a[0]), y]


def tidy(pts):
    """Round, drop repeated points and close the ring. None if it collapses."""
    out = []
    for x, y in pts:
        p = [round(x, PLACES), round(y, PLACES)]
        if not out or p != out[-1]:
            out.append(p)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    if len(out) < 3:
        return None
    return out + [out[0]]


def main():
    with urllib.request.urlopen(SOURCE) as resp:
        land = json.load(resp)

    polygons = []
    for feature in land["features"]:
        geom = feature["geometry"]
        parts = geom["coordinates"] if geom["type"] == "MultiPolygon" \
            else [geom["coordinates"]]
        for rings in parts:
            outer = tidy(clip_ring(rings[0], BOX))
            if not outer:
                continue
            holes = [h for h in (tidy(clip_ring(r, BOX)) for r in rings[1:]) if h]
            polygons.append([outer] + holes)

    out = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"source": "Natural Earth 1:50m land, v5.1.2"},
            "geometry": {"type": "MultiPolygon", "coordinates": polygons},
        }],
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"[land] {len(polygons)} polygons, {OUT.stat().st_size // 1024} KB "
          f"-> {OUT.relative_to(OUT.parent.parent.parent)}")


if __name__ == "__main__":
    main()
