"""Entry point and FastAPI backend for Formula Sprint 3D.

Start the game with:
    python main.py

Then open http://127.0.0.1:8000 in a browser.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Formula Sprint 3D Racing Game", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Lightweight in-memory telemetry store. The browser runs physics locally for a
# responsive driving feel; the backend records session/lap snapshots for future
# replay, validation, ghost-car, or leaderboard features.
SESSIONS: dict[str, dict[str, Any]] = {}


@app.get("/")
def index() -> FileResponse:
    """Serve the game webpage."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Expose a small health check for local/deployment smoke tests."""
    return {"ok": True, "active_sessions": len(SESSIONS)}


@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket) -> None:
    """Accept periodic racing telemetry from the browser client."""
    await websocket.accept()
    session_id = uuid4().hex
    SESSIONS[session_id] = {
        "connected_at": time.time(),
        "last_seen": time.time(),
        "laps": [],
        "latest": {},
    }
    await websocket.send_json({"type": "session", "sessionId": session_id})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            session = SESSIONS[session_id]
            session["last_seen"] = time.time()

            if message.get("type") == "telemetry":
                payload = message.get("payload", {})
                session["latest"] = payload
                if payload.get("lapCompleted"):
                    session["laps"].append(
                        {
                            "lap": payload.get("lap"),
                            "lapTime": payload.get("lastLapTime"),
                            "serverTime": session["last_seen"],
                        }
                    )
                await websocket.send_json(
                    {
                        "type": "ack",
                        "serverTime": session["last_seen"],
                        "sessionId": session_id,
                        "lapsStored": len(session["laps"]),
                    }
                )
            elif message.get("type") == "ping":
                await websocket.send_json({"type": "pong", "serverTime": time.time()})
            else:
                await websocket.send_json({"type": "error", "message": "Unknown message type"})
    except WebSocketDisconnect:
        SESSIONS.pop(session_id, None)


def run() -> None:
    """Run the local development server."""
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    run()
