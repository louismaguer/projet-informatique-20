#!/usr/bin/env python3
"""
Proxy relayer HTTP -> JSON-RPC vers hardhat
Traduit les requêtes HTTP du browser SDK en JSON-RPC vers le hardhat FHEVM mock
"""
import http.server
import json
import urllib.request
import threading
import socketserver
import sys
import time

HARDHAT_RPC = "http://localhost:8545"
PROXY_PORT = 8081

# Méthode HTTP path -> méthode JSON-RPC
PATH_TO_RPC = {
    "/metadata": "fhevm_relayer_metadata",
    "/input-proof": "fhevm_relayer_v1_input_proof",
    "/user-decrypt": "fhevm_relayer_v1_user_decrypt",
    "/delegated-user-decrypt": "fhevm_relayer_v1_delegated_user_decrypt",
    "/public-decrypt": "fhevm_relayer_v1_public_decrypt",
}


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[Proxy] {self.command} {self.path}")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        # 1. Trouver la méthode JSON-RPC correspondante au chemin HTTP
        rpc_method = None
        for prefix_path, rpc_name in PATH_TO_RPC.items():
            if self.path == prefix_path or self.path.rstrip("/") == prefix_path.rstrip("/"):
                rpc_method = rpc_name
                break
        if not rpc_method:
            # Fallback : dériver le nom à partir du suffixe du chemin
            # (ex. "/v1/user-decrypt" -> "user-decrypt" -> "fhevm_relayer_v1_user_decrypt")
            for prefix_path, rpc_name in PATH_TO_RPC.items():
                if self.path.endswith(prefix_path.lstrip("/")):
                    rpc_method = rpc_name
                    break
        if not rpc_method:
            self.send_error(404)
            return

        # 2. Lire le body et le passer tel quel comme paramètre JSON-RPC
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            content_length = 0
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            params = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except json.JSONDecodeError:
            # Body non-JSON : on le passe tel quel en string (rare, mais le SDK
            # peut envoyer du texte brut dans certains cas).
            params = body_bytes.decode("utf-8", errors="replace")

        # 3. Convertir en JSON-RPC standard (le hardhat mock comprend ce format).
        payload = json.dumps({
            "jsonrpc": "2.0",
            "method": rpc_method,
            "params": [params],
            "id": int(time.time() * 1000) % 100000
        }).encode()

        # 4. Forward vers hardhat
        req = urllib.request.Request(
            HARDHAT_RPC,
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                hardhat_resp = resp.read().decode()
        except Exception as e:
            # 502 Bad Gateway : on indique clairement que c'est le backend en aval qui a planté.
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        # 5. Renvoyer la réponse au client HTTP en désencapsulant le champ `result`
        try:
            parsed = json.loads(hardhat_resp)
            # Si la réponse est enveloppée JSON-RPC (champ `result`), on extrait ;
            # sinon on renvoie la réponse brute (compatibilité anciens clients).
            result = parsed.get("result", parsed)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(result, default=str).encode())
        except json.JSONDecodeError:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(hardhat_resp.encode())


def run():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PROXY_PORT), Handler) as httpd:
        print(f"🔌 Relayer proxy listening on http://localhost:{PROXY_PORT}")
        print(f"   Forwarding to hardhat: {HARDHAT_RPC}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")
            httpd.shutdown()


if __name__ == "__main__":
    run()
