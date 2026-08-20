"""Benchmark metrics and reporting types."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class ScenarioResult:
    """Outcome of running the pipeline against a single scenario."""

    scenario_id: str
    verified_correctly: bool
    verification_latency_ms: float
    arbitration_triggered: bool
    arbitration_succeeded: Optional[bool]
    min_safety_margin_m: float


@dataclass(frozen=True)
class BenchmarkReport:
    """Aggregate report across a batch of scenarios."""

    total_scenarios: int
    accuracy: float  # fraction of scenarios verified correctly vs. ground truth
    mean_latency_ms: float
    p99_latency_ms: float
    arbitration_success_rate: float
    results: List[ScenarioResult]
