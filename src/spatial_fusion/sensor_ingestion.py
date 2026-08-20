"""Sensor ingestion adapters for LIDAR, camera, and radar.

Each adapter normalizes raw sensor driver output into a common
`SensorFrame` representation consumed by `voxel_grid.VoxelGridBuilder`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np


@dataclass(frozen=True)
class SensorFrame:
    """Normalized single-sensor observation for one fusion cycle."""

    sensor_id: str
    timestamp_s: float
    points_xyz: np.ndarray  # (N, 3) points in the vehicle reference frame
    point_confidence: np.ndarray  # (N,) per-point confidence in [0, 1]


class SensorAdapter(Protocol):
    """Contract implemented by each sensor-specific ingestion adapter."""

    def read(self) -> SensorFrame:
        """Return the next normalized sensor frame."""
        ...


class LidarAdapter:
    """Normalizes raw LIDAR point clouds into `SensorFrame` objects."""

    def __init__(self, sensor_id: str = "lidar_main") -> None:
        self.sensor_id = sensor_id

    def read(self) -> SensorFrame:
        # TODO(phase-1): integrate with LIDAR driver / rosbag / benchmark dataset reader.
        raise NotImplementedError


class CameraAdapter:
    """Converts monocular/stereo depth estimates into `SensorFrame` objects."""

    def __init__(self, sensor_id: str = "camera_front") -> None:
        self.sensor_id = sensor_id

    def read(self) -> SensorFrame:
        # TODO(phase-1): integrate depth-estimation model output.
        raise NotImplementedError


class RadarAdapter:
    """Normalizes radar detections (with velocity/Doppler) into `SensorFrame` objects."""

    def __init__(self, sensor_id: str = "radar_front") -> None:
        self.sensor_id = sensor_id

    def read(self) -> SensorFrame:
        # TODO(phase-1): integrate radar driver output.
        raise NotImplementedError
