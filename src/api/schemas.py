"""Pydantic schemas mirroring `common.types` for the API request/response boundary.

Kept separate from `common.types` (internal dataclasses) so the wire format
can evolve independently of internal representations.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class WaypointDTO(BaseModel):
    x: float
    y: float
    heading_rad: float
    timestamp_s: float
    velocity_mps: float


class TrajectoryDTO(BaseModel):
    trajectory_id: str
    waypoints: List[WaypointDTO]
    vehicle_class: str


class SafetyVerdictDTO(BaseModel):
    trajectory_id: str
    is_safe: bool
    min_safety_margin_m: float
    violation_timestamp_s: Optional[float] = None
    evidence_ref: Optional[str] = None


class VerifyRequest(BaseModel):
    trajectory: TrajectoryDTO
    min_margin_m: Optional[float] = None


class VerifyResponse(BaseModel):
    verdict: SafetyVerdictDTO
    alternatives: List[TrajectoryDTO] = []


class SimulationRunRequest(BaseModel):
    scenario_set: str  # e.g. "public_benchmark", "procedural", "edge_cases"
    num_scenarios: int = 100


class SimulationRunResponse(BaseModel):
    total_scenarios: int
    accuracy: float
    mean_latency_ms: float
    p99_latency_ms: float
    arbitration_success_rate: float
