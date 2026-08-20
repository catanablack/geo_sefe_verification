"""Predictive Occupancy Forecasting Module (Phase 2).

Applies graph neural networks (GNNs) to the occupancy representation to
forecast near-future positions of dynamic objects (pedestrians, cyclists,
other vehicles), giving the safety system a forward-looking margin.
"""
from src.predictive_occupancy.forecaster import GNNOccupancyForecaster

__all__ = ["GNNOccupancyForecaster"]
