"""FastAPI application entry point.

Wires together the core engines (constructed via `cross_platform.adapters`
for a given vehicle profile) and mounts the `routes` sub-routers.
"""
from __future__ import annotations

from fastapi import FastAPI

from src.api.routes import simulation, telemetry, verification

app = FastAPI(
    title="Geometric Safety Verification Platform API",
    description="Real-time trajectory safety verification for autonomous vehicles.",
    version="0.1.0",
)

app.include_router(verification.router, prefix="/verify", tags=["verification"])
app.include_router(simulation.router, prefix="/simulate", tags=["simulation"])
app.include_router(telemetry.router, prefix="/telemetry", tags=["telemetry"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
