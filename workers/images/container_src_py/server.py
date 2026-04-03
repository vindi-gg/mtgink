"""Simple HTTP server for MTG Ink scraper container.

Accepts job triggers via HTTP, runs Python scripts, reports status.
Works identically on Cloudflare Containers and local Docker.
"""

import json
import os
import subprocess
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT = 8080
SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "scripts")

# Shared state
status = {
    "state": "idle",
    "message": "Container ready, waiting for job trigger",
    "job": None,
    "error": None,
    "env": {
        "SUPABASE_DB_URL": "set" if os.environ.get("SUPABASE_DB_URL") else "NOT SET",
        "R2_ENDPOINT": "set" if os.environ.get("R2_ENDPOINT") else "NOT SET",
        "R2_ACCESS_KEY_ID": "set" if os.environ.get("R2_ACCESS_KEY_ID") else "NOT SET",
        "R2_SECRET_ACCESS_KEY": "set" if os.environ.get("R2_SECRET_ACCESS_KEY") else "NOT SET",
        "OUTPUT_DIR": os.environ.get("OUTPUT_DIR", "filesystem"),
    },
}
job_running = False

JOBS = {
    "sync": ["download_bulk.py", "import_data_postgres.py", "download_images.py", "import_prices.py", "import_tags.py"],
    "data": ["download_bulk.py", "import_data_postgres.py"],
    "cards": ["download_bulk.py", "import_data_postgres.py", "download_images.py"],
    "images": ["download_images.py"],
    "prices": ["import_prices.py"],
    "tags": ["import_tags.py"],
    "r2test": ["r2_test.py"],
}


def run_job(job_type: str, set_code: str | None = None, force: bool = False):
    global job_running, status
    scripts = JOBS.get(job_type)
    if not scripts:
        status["state"] = "error"
        status["error"] = f"Unknown job: {job_type}"
        job_running = False
        return

    status["state"] = "processing"
    status["job"] = job_type
    status["error"] = None
    start = time.time()

    try:
        for script in scripts:
            script_path = os.path.join(SCRIPTS_DIR, script)
            status["message"] = f"Running {script}"
            print(f"[{job_type}] Running {script}", flush=True)

            cmd = [sys.executable, script_path]
            if script == "download_images.py":
                if set_code:
                    cmd += ["--set", set_code]
                if force:
                    cmd += ["--force"]

            env = {**os.environ}
            result = subprocess.run(
                cmd, env=env, capture_output=True, text=True, timeout=3600
            )

            if result.stdout:
                lines = result.stdout.strip().split("\n")
                for line in lines[-10:]:
                    print(f"  {line}", flush=True)
                status["message"] = lines[-1] if lines else f"Completed {script}"
                status["output"] = "\n".join(lines[-50:])  # Keep last 50 lines for remote debug

            if result.stderr:
                status["stderr"] = result.stderr.strip()[-500:]

            if result.returncode != 0:
                error_msg = result.stderr.strip().split("\n")[-1] if result.stderr else f"{script} failed"
                raise RuntimeError(f"{script} failed (exit {result.returncode}): {error_msg}")

        elapsed = time.time() - start
        status["state"] = "done"
        status["message"] = f"Completed {job_type} in {elapsed:.1f}s"
        status["elapsed"] = f"{elapsed:.1f}s"
        print(f"[{job_type}] Done in {elapsed:.1f}s", flush=True)

    except Exception as e:
        elapsed = time.time() - start
        status["state"] = "error"
        status["error"] = str(e)
        status["message"] = f"Job {job_type} failed: {e}"
        print(f"[{job_type}] FAILED after {elapsed:.1f}s: {e}", flush=True)

    finally:
        job_running = False


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """GET / — return status"""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(status).encode())

    def do_POST(self):
        """POST /run?job=sync — trigger a job"""
        global job_running

        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path != "/run":
            self.send_response(404)
            self.end_headers()
            return

        if job_running:
            self.send_response(409)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Job already running", "status": status}).encode())
            return

        job_type = params.get("job", ["sync"])[0]
        set_code = params.get("sets", [None])[0]
        force = params.get("force", ["0"])[0] == "1"

        job_running = True
        thread = threading.Thread(target=run_job, args=(job_type, set_code, force), daemon=True)
        thread.start()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"started": job_type, "force": force}).encode())

    def log_message(self, format, *args):
        # Suppress default request logging
        pass


if __name__ == "__main__":
    print(f"MTG Ink scraper container starting on port {PORT}", flush=True)
    print(f"  SUPABASE_DB_URL: {'set' if os.environ.get('SUPABASE_DB_URL') else 'NOT SET'}", flush=True)
    print(f"  OUTPUT_DIR: {os.environ.get('OUTPUT_DIR', 'filesystem')}", flush=True)
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
