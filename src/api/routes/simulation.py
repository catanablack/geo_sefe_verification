"""Simulation harness endpoints.

POST /simulate — triggers a benchmark run against a named scenario set
(public benchmark, procedural, or generated edge cases) and returns an
aggregate report.
"""
from __future__ import annotations

from fastapi import APIRouter

from src.api.schemas import SimulationRunRequest, SimulationRunResponse

router = APIRouter()


@router.post("", response_model=SimulationRunResponse)
def run_simulation(request: SimulationRunRequest) -> SimulationRunResponse:
    """TODO(phase-1/2):
    1. Use `simulation_harness.ScenarioGenerator` to load/generate
       `request.num_scenarios` scenarios from `request.scenario_set`.
    2. Run them through `simulation_harness.BenchmarkRunner`.
    3. Return the resulting `BenchmarkReport` mapped to `SimulationRunResponse`.
    """
    raise NotImplementedError
