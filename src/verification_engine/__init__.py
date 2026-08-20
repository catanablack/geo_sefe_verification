"""Geometric Collision-Safety Verification Engine (Phase 1 — core technical contribution).

Formal, computational-geometry-based verification of whether a planner's
candidate trajectory maintains a defined safety margin against current and
forecasted occupancy, using swept-volume collision analysis and signed
distance fields (SDFs). Planner-agnostic by design (see interfaces.py).
"""
from src.verification_engine.interfaces import SafetyVerifier, TrajectoryArbitrator
from src.verification_engine.safety_certifier import GeometricSafetyCertifier

__all__ = ["SafetyVerifier", "TrajectoryArbitrator", "GeometricSafetyCertifier"]
