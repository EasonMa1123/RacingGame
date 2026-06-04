# Formula Sprint 3D

A complete browser-hosted 3D open-wheel racing game inspired by modern F1 broadcast and game HUD aesthetics. The frontend uses Three.js for rendering and arcade vehicle dynamics; the Python backend uses FastAPI to serve the game and collect telemetry over WebSockets.

## Project structure

```text
RacingGame/
├── app.py                  # FastAPI app, static file serving, telemetry WebSocket
├── requirements.txt        # Python dependencies
├── static/
│   ├── index.html          # Canvas and F1-style HUD shell
│   ├── styles.css          # Full-screen game styling and HUD panels
│   └── game.js             # Three.js world, car, controls, camera, physics, HUD
└── README.md
```

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Open <http://127.0.0.1:8000> in a browser.

## Controls

- Gamepad: right trigger accelerates, left trigger brakes/reverses, left stick steers.
- Keyboard: `W`/`ArrowUp` accelerates, `S`/`ArrowDown` brakes, `A`/`D` or arrow keys steer, `C` toggles chase/cockpit camera.

## Gameplay features

- Primitive-built glossy F1-style car with wings, halo, tires, and metallic paint.
- Looping circuit with asphalt ribbon, red/white kerbs, guard rails, grandstands, grass, skyline, shadows, and fog.
- Smooth chase camera with high-speed FOV stretching plus cockpit camera toggle.
- Arcade physics with acceleration curves, drag, braking, speed-based steering, and drift/grip behavior.
- F1-inspired HUD with speed, gear, RPM redline flash, lap timer, lap counter, best lap, backend status, and minimap.
- FastAPI WebSocket telemetry endpoint ready for lap logging, validation, leaderboards, ghosts, or multiplayer extensions.
