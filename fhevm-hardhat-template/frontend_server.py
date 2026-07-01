#!/usr/bin/env python3
"""
Serveur frontend avec reverse proxy intégré.

Sert le sous-dossier frontend/ (index.html, mock-fhevm.js, bundle/) en no-cache.
Proxy /api/rpc  -> http://localhost:8545 (noeud Hardhat, JSON-RPC + relayer mock)
Proxy /api/relayer/* -> http://localhost:8081/* (relayer proxy classique)
Endpoint /api/contract -> {address, admin} depuis deployments/localhost/ConfidentialVoting.json

Le reverse proxy permet de n'exposer qu'un seul port (8080) — utile pour un
tunnel Cloudflare ou un hébergement statique.
"""
import http.server
import socketserver
import os
import sys
import json
import urllib.request
import urllib.error

PORT = 8080
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
DEPLOY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deployments", "localhost")
HARDHAT_RPC = os.environ.get("HARDHAT_RPC", "http://localhost:8545")
RELAYER_URL = os.environ.get("RELAYER_URL", "http://localhost:8081")


def get_contract_info():
    """Lit l'adresse du contrat depuis deployments/localhost/ConfidentialVoting.json
    et l'adresse admin depuis scripts/.admin_addr (généré par start.sh)."""
    info = {"address": None, "admin": None, "error": None}
    try:
        with open(os.path.join(DEPLOY_DIR, "ConfidentialVoting.json")) as f:
            data = json.load(f)
        info["address"] = data.get("address")
    except FileNotFoundError:
        info["error"] = "Contract not deployed. Run 'npx hardhat deploy --network localhost'"
        return info
    except Exception as e:
        info["error"] = str(e)
        return info
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts", ".admin_addr")) as f:
            info["admin"] = f.read().strip()
    except FileNotFoundError:
        pass
    return info


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # CORS permissif pour le développement multi-appareils
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        # /api/rpc -> Hardhat JSON-RPC (et relayer mock, qui utilise le même endpoint)
        if self.path == "/api/rpc" or self.path.startswith("/api/rpc?"):
            self._proxy(HARDHAT_RPC, rewrite_path="/")
            return
        # /api/relayer/* -> relayer proxy :8081
        if self.path.startswith("/api/relayer"):
            target_path = self.path[len("/api/relayer"):] or "/"
            self._proxy(RELAYER_URL, rewrite_path=target_path)
            return
        # Sinon, fallback fichier statique
        self.do_GET()

    def do_GET(self):
        # /api/rpc en GET = test de santé (renvoie le numéro de bloc)
        if self.path == "/api/rpc/health" or self.path == "/api/health":
            self._proxy(HARDHAT_RPC, rewrite_path="/", body_override=b'{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}')
            return
        # /api/contract -> adresse et admin du contrat déployé
        if self.path == "/api/contract" or self.path.startswith("/api/contract?"):
            info = get_contract_info()
            payload = json.dumps(info).encode()
            self.send_response(200 if info["address"] else 404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload)
            return
        # Fichiers statiques
        super().do_GET()

    def _proxy(self, target_base, rewrite_path=None, body_override=None):
        """Forward une requête (POST/GET) vers target_base + rewrite_path."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            content_length = 0

        if body_override is not None:
            body_bytes = body_override
        elif content_length > 0:
            body_bytes = self.rfile.read(content_length)
        else:
            body_bytes = b""

        target_path = rewrite_path if rewrite_path is not None else "/"
        target_url = target_base.rstrip("/") + target_path
        # Préserver les query params éventuels
        if "?" in self.path and rewrite_path is not None:
            qs = self.path.split("?", 1)[1]
            target_url += "?" + qs

        try:
            req = urllib.request.Request(
                target_url,
                data=body_bytes if body_bytes else None,
                method="POST" if body_bytes or self.command == "POST" else "GET",
                headers={"Content-Type": self.headers.get("Content-Type", "application/json")},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(e.read() if e.fp else b'{"error":"upstream error"}')
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(('{"error":' + repr(str(e)) + '}').encode())


def run():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
        info = get_contract_info()
        print(f"🌐 Frontend (no-cache) on http://localhost:{PORT}")
        print(f"   Reverse proxy /api/rpc      -> {HARDHAT_RPC}")
        print(f"   Reverse proxy /api/relayer  -> {RELAYER_URL}")
        print(f"   Endpoint /api/contract      -> {info['address'] or '(not deployed)'}")
        if info.get("admin"):
            print(f"   Admin                       -> {info['admin']}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")
            httpd.shutdown()


if __name__ == "__main__":
    run()
