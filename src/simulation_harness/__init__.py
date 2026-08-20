"""Scalable Simulation and Validation Harness (Phase 1/2).

Stress-tests the complete pipeline against large libraries of synthetic
driving scenarios, including rare and safety-critical edge cases generated
through procedural and generative methods, before any real-world or partner
deployment.
"""
from src.simulation_harness.benchmark_runner import BenchmarkRunner
from src.simulation_harness.scenario_generator import ScenarioGenerator

__all__ = ["BenchmarkRunner", "ScenarioGenerator"]
