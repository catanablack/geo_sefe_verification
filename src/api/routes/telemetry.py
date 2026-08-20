"""Live telemetry streaming for the 3D visualization dashboard.

WebSocket /telemetry — streams the current VoxelGrid (or a compressed/
downsampled projection of it), active trajectory + verdict, and agent
forecasts to the `frontend` in real time.
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket

router = APIRouter()


@router.websocket("/stream")
async def telemetry_stream(websocket: WebSocket) -> None:
    """TODO(phase-3 / dashboard integration):
    1. Accept the WebSocket connection.
    2. On each fusion cycle, serialize a `TelemetryFrame` (voxel occupancy
       summary, current trajectory + SafetyVerdict, agent forecasts) to JSON.
    3. Send it to the client; the frontend's SceneViewer3D renders it.
    """
    await websocket.accept()
    raise NotImplementedError
