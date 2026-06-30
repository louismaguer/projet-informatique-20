#!/usr/bin/env python3
"""Serveur frontend avec headers no-cache pour forcer le rechargement des modules JS."""
import http.server
import socketserver
import os
import sys

PORT = 8080
# Sert le sous-dossier frontend/ (où se trouvent index.html, mock-fhevm.js, bundle/)
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def run():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
        print(f"🌐 Frontend (no-cache) on http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            httpd.shutdown()


if __name__ == "__main__":
    run()