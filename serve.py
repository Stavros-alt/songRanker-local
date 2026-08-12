#!/usr/bin/env python3
# local dev server with no caching at all. python http.server sends
# a last modified header and stale JS gets served from the browser
# cache, which broke things repeatedly. this never caches anything.
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
