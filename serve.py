#!/usr/bin/env python3
"""Static dev server for QL-700 Label Studio.

Same as `python -m http.server`, but sends Cache-Control: no-store so Chrome
re-fetches the ES modules on every reload (no more stale js/app.js after edits),
and serves .mjs as JavaScript regardless of the Windows registry mapping.

    python serve.py [port]      # default 8000, binds 127.0.0.1
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter: skip the per-request noise
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'QL-700 Label Studio: http://localhost:{port}  (Ctrl+C to stop)')
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
