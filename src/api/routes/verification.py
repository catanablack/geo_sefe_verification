"""Trajectory verification endpoint.

POST /verify — the primary planner-facing endpoint: submits a candidate
`Trajectory` and returns a `SafetyVerdict`, plus arbitration alternatives if
the candidate fails verification.
"""
from __future__ import annotations

from fastapi import APIRouter

from src.api.schemas import VerifyRequest, VerifyResponse

router = APIRouter()


@router.post("", response_model=VerifyResponse)
def verify_trajectory(request: VerifyRequest) -> VerifyResponse:
    """TODO(phase-1/2):
    1. Map `request.trajectory` (DTO) -> `common.types.Trajectory`.
    2. Fetch latest `VoxelGrid` from the running `spatial_fusion` pipeline
       and latest `DynamicAgentForecast`s from `predictive_occupancy`.
    3. Call `verification_engine.GeometricSafetyCertifier.verify(...)`.
    4. If unsafe, call `trajectory_arbitration.FallbackTrajectoryArbitrator
       .propose_alternatives(...)`.
    5. Map results back to DTOs and return `VerifyResponse`.
    """
    raise NotImplementedError
