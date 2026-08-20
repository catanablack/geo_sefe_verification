"""Hard and soft constraints applied during trajectory arbitration.

Hard constraints (kinematic feasibility, road-boundary compliance) must never
be violated by a proposed alternative; soft constraints (comfort, energy)
are optimization objectives, not gates.
"""
from __future__ import annotations

from dataclasses import dataclass

from src.common.types import Trajectory


@dataclass(frozen=True)
class KinematicLimits:
    max_speed_mps: float
    max_accel_mps2: float
    max_decel_mps2: float
    max_yaw_rate_rps: float


def is_kinematically_feasible(trajectory: Trajectory, limits: KinematicLimits) -> bool:
    """Hard-constraint check: reject candidates violating vehicle kinematic limits.

    TODO(phase-2): differentiate waypoints to derive speed/accel/yaw-rate and
    compare against `limits`.
    """
    raise NotImplementedError


def comfort_cost(trajectory: Trajectory) -> float:
    """Soft-constraint objective: penalize high jerk / lateral acceleration."""
    raise NotImplementedError


def energy_cost(trajectory: Trajectory) -> float:
    """Soft-constraint objective: penalize energy-inefficient speed profiles."""
    raise NotImplementedError
