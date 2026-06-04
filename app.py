"""FastAPI server for the browser-based Formula Sprint racing game.

Run locally with:
    uvicorn app:app --reload

The backend serves the Three.js frontend and accepts lightweight telemetry over a
WebSocket so lap/session data can be logged or extended for multiplayer later.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Formula Sprint 3D Racing Game", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# In-memory session telemetry. This intentionally stays small and simple; it can
# be replaced with Redis/Postgres if persistent leaderboards are desired.
SESSIONS: dict[str, dict[str, Any]] = {}


@app.get("/")
def index() -> FileResponse:
    """Serve the game shell."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Small health endpoint used by local checks and deployment probes."""
    return {"ok": True, "active_sessions": len(SESSIONS)}


@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket) -> None:
    """Receive browser telemetry and return authoritative session metadata.

    The client runs physics locally for low-latency play. The backend records a
    rolling stream of state snapshots and lap events, then acknowledges messages
    with server time. This keeps the architecture ready for validation,
    leaderboards, replays, or multiplayer ghost cars without making the game
    dependent on network round trips.
    """
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
