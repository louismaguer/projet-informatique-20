#!/usr/bin/env python3
"""
Serveur backend léger pour le frontend:
- Sert l'interface (port 8080)
- Expose /api/demo pour lancer la démo automatique
- Expose /api/elections pour lire les elections
- Expose /api/results/<id> pour lire les résultats
"""
import http.server
import json
import os
import subprocess
import socketserver
import urllib.request
from pathlib import Path

_HERE = Path(__file__).resolve().parent
FRONTEND_DIR = _HERE / "frontend"
HARDHAT_DIR = _HERE
CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
RPC_URL = "http://localhost:8545"
PORT = 8080

# Compteurs
COUNT_ABI = {
    "electionCounter": "0x7bb16b56",
    "getElection": "0x5e6fef01",
    "getEncryptedTally": "0x85f56f8d",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def log_message(self, format, *args):
        print(f"[Server] {format % args}")

    def do_GET(self):
        if self.path == "/api/status":
            self.check_status()
        elif self.path.startswith("/api/results/"):
            election_id = self.path.split("/")[-1]
            self.get_results(election_id)
        elif self.path.startswith("/api/elections"):
            self.list_elections()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/demo":
            self.run_demo()
        elif self.path == "/api/createElection":
            self.create_election()
        elif self.path == "/api/closeElection":
            self.close_election()
        else:
            self.send_error(404)

    def handle_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.handle_cors()
        self.end_headers()

    def respond_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.handle_cors()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def rpc_call(self, method, params=[]):
        payload = json.dumps({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1
        }).encode()
        req = urllib.request.Request(
            RPC_URL,
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                return data.get("result"), data.get("error")
        except Exception as e:
            return None, str(e)

    def read_block(self, n):
        data = "0x" + format(n, "064x")
        result, _ = self.rpc_call("eth_call", [{"to": CONTRACT_ADDRESS, "data": data}, "latest"])
        if not result or result == "0x":
            return 0
        return int(result, 16)

    def read_election(self, election_id):
        """Lit une election via eth_call"""
        data = COUNT_ABI["getElection"] + format(election_id, "064x")
        result, err = self.rpc_call("eth_call", [{"to": CONTRACT_ADDRESS, "data": data}, "latest"])
        if not result or result == "0x":
            return None

        hex_data = result[2:]
        if len(hex_data) < 320:
            return None

        e_id = int(hex_data[0:64], 16)
        title_offset = int(hex_data[64:128], 16)
        options_offset = int(hex_data[128:192], 16)
        is_active = int(hex_data[192:256], 16) == 1
        voter_count = int(hex_data[256:320], 16)

        # Decode title
        try:
            title_len = int(hex_data[title_offset*2:title_offset*2+64], 16)
            title_hex = hex_data[title_offset*2+64:title_offset*2+64+title_len*2]
            title = bytes.fromhex(title_hex).decode("utf-8", errors="replace")
        except Exception:
            title = "(erreur)"

        # Decode options array (dynamique)
        options = []
        try:
            opts_len = int(hex_data[options_offset*2:options_offset*2+64], 16)
            offset_pos = options_offset*2 + 64
            for _ in range(opts_len):
                if offset_pos + 64 > len(hex_data):
                    break
                str_offset = int(hex_data[offset_pos:offset_pos+64], 16)
                str_pos = options_offset*2 + str_offset*2
                if str_pos + 64 > len(hex_data):
                    break
                str_len = int(hex_data[str_pos:str_pos+64], 16)
                str_hex = hex_data[str_pos+64:str_pos+64+str_len*2]
                options.append(bytes.fromhex(str_hex).decode("utf-8", errors="replace"))
                offset_pos += 64
        except Exception:
            pass

        return {
            "id": e_id,
            "title": title,
            "options": options,
            "isActive": is_active,
            "voterCount": voter_count,
            "optionCount": len(options),
        }

    def check_status(self):
        chain_id, _ = self.rpc_call("eth_chainId")
        if chain_id is None:
            self.respond_json({"ok": False, "error": "Hardhat non disponible"}, 503)
            return
        block, _ = self.rpc_call("eth_blockNumber")
        block_int = int(block, 16) if isinstance(block, str) and block.startswith("0x") else 0
        self.respond_json({
            "ok": True,
            "chainId": int(chain_id, 16) if isinstance(chain_id, str) else chain_id,
            "block": block_int,
            "contractAddress": CONTRACT_ADDRESS,
        })

    def list_elections(self):
        count = self.read_block(0)  # reuse general call
        try:
            result, _ = self.rpc_call("eth_call", [
                {"to": CONTRACT_ADDRESS, "data": COUNT_ABI["electionCounter"]},
                "latest"
            ])
            counter_int = int(result, 16) if result else 0
        except Exception:
            counter_int = 0

        elections = []
        for i in range(1, counter_int + 1):
            election = self.read_election(i)
            if election:
                elections.append(election)
        self.respond_json({"ok": True, "elections": elections})

    def get_results(self, election_id):
        try:
            election = self.read_election(int(election_id))
            if not election:
                self.respond_json({"ok": False, "error": "Election non trouvée"}, 404)
                return

            results = []
            for i in range(len(election["options"])):
                data = COUNT_ABI["getEncryptedTally"] + format(int(election_id), "064x") + format(i, "064x")
                tally, _ = self.rpc_call("eth_call", [{"to": CONTRACT_ADDRESS, "data": data}, "latest"])
                results.append({
                    "option": election["options"][i],
                    "tallyHandle": tally,
                })

            self.respond_json({"ok": True, "election": election, "results": results})
        except Exception as e:
            self.respond_json({"ok": False, "error": str(e)}, 500)

    def run_demo(self):
        try:
            env = os.environ.copy()
            env["CONTRACT_ADDRESS"] = CONTRACT_ADDRESS
            result = subprocess.run(
                ["npx", "hardhat", "run", "scripts/demo.js", "--network", "localhost"],
                cwd=HARDHAT_DIR,
                capture_output=True,
                text=True,
                timeout=180,
                env=env,
            )
            self.respond_json({
                "ok": result.returncode == 0,
                "stdout": result.stdout[-3000:] if result.stdout else "",
                "stderr": result.stderr[-1500:] if result.stderr else "",
            })
        except subprocess.TimeoutExpired:
            self.respond_json({"ok": False, "error": "Timeout"}, 504)
        except Exception as e:
            self.respond_json({"ok": False, "error": str(e)}, 500)

    def create_election(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            data = json.loads(body)
            title = data.get("title", "").strip()
            options = [o.strip() for o in data.get("options", []) if o.strip()]
            if not title or len(options) < 2:
                self.respond_json({"ok": False, "error": "Titre et au moins 2 options requis"}, 400)
                return

            args = [title, ",".join(options)]
            env = os.environ.copy()
            env["CONTRACT_ADDRESS"] = CONTRACT_ADDRESS
            result = subprocess.run(
                ["npx", "hardhat", "run", "scripts/createElection.js", "--network", "localhost"] + args,
                cwd=HARDHAT_DIR,
                capture_output=True,
                text=True,
                timeout=30,
                env=env,
            )
            self.respond_json({
                "ok": result.returncode == 0,
                "stdout": result.stdout[-1500:] if result.stdout else "",
                "stderr": result.stderr[-1000:] if result.stderr else "",
            })
        except Exception as e:
            self.respond_json({"ok": False, "error": str(e)}, 500)

    def close_election(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            data = json.loads(body)
            election_id = data.get("electionId")
            if not election_id:
                self.respond_json({"ok": False, "error": "ID requis"}, 400)
                return

            env = os.environ.copy()
            env["CONTRACT_ADDRESS"] = CONTRACT_ADDRESS
            result = subprocess.run(
                ["npx", "hardhat", "run", "scripts/closeElection.js", "--network", "localhost", str(election_id)],
                cwd=HARDHAT_DIR,
                capture_output=True,
                text=True,
                timeout=30,
                env=env,
            )
            self.respond_json({
                "ok": result.returncode == 0,
                "stdout": result.stdout[-1500:] if result.stdout else "",
                "stderr": result.stderr[-1000:] if result.stderr else "",
            })
        except Exception as e:
            self.respond_json({"ok": False, "error": str(e)}, 500)


def run():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"🌐 Backend running on http://localhost:{PORT}")
        print(f"   - Frontend:    http://localhost:{PORT}/")
        print(f"   - API status:  http://localhost:{PORT}/api/status")
        print(f"   - API demo:    POST http://localhost:{PORT}/api/demo")
        print(f"   - Contract:    {CONTRACT_ADDRESS}")
        httpd.serve_forever()


if __name__ == "__main__":
    run()
