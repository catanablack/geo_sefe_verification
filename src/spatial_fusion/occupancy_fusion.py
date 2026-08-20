"""Multi-sensor occupancy fusion orchestration.

Coordinates `sensor_ingestion` adapters and `voxel_grid.VoxelGridBuilder` to
produce one fused `VoxelGrid` per fusion cycle, and models cross-sensor
disagreement as additional uncertainty.
"""
from __future__ import annotations

from typing import Sequence

from src.common.types import VoxelGrid
from src.spatial_fusion.sensor_ingestion import SensorAdapter
from src.spatial_fusion.voxel_grid import VoxelGridBuilder


class OccupancyFusionEngine:
    """Real-time fusion loop: sensors -> normalized frames -> probabilistic VoxelGrid."""

    def __init__(self, sensors: Sequence[SensorAdapter], builder: VoxelGridBuilder) -> None:
        self.sensors = sensors
        self.builder = builder

    def fuse_cycle(self) -> VoxelGrid:
        """Read one frame from each sensor and fuse them into a single VoxelGrid."""
        frames = [sensor.read() for sensor in self.sensors]
        return self.builder.build(frames)
