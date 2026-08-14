#!/usr/bin/env python3
"""Serve docs/ locally, with gzip, because GitHub Pages does.

Without compression a local preview is several times heavier than the real
site, and you end up optimising the wrong thing. The event index is the file
this matters for.

    python3 tools/serve.py            then open http://127.0.0.1:8787
    python3 tools/serve.py --port 9000
"""

import argparse
import gzip
import io
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "docs"
COMPRESS = {".html", ".css", ".js", ".json", ".csv", ".txt", ".svg"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        # One line per request, without the timestamp noise.
        sys.stderr.write("  %s\n" % (fmt % args))

    def end_headers(self):
        # No caching locally, so a rebuild shows up on reload rather than
        # sending you hunting for a bug that is the browser's memory.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            return super().send_head()
        if not path.exists():
            # Match the published site: an unknown path gets the 404 page.
            self.send_response(404)
            body = (ROOT / "404.html").read_bytes()
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return io.BytesIO(body)

        accepts = "gzip" in self.headers.get("Accept-Encoding", "")
        if not (accepts and path.suffix.lower() in COMPRESS):
            return super().send_head()

        raw = path.read_bytes()
        packed = gzip.compress(raw, 6)
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(packed)))
        self.end_headers()
        if self.command == "HEAD":
            return None
        return io.BytesIO(packed)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()
    if not ROOT.exists():
        sys.exit(f"No {ROOT}. Run the pipeline first.")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Serving {ROOT} at http://127.0.0.1:{args.port}")
    print("Compressed, as GitHub Pages serves it. Ctrl-C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
