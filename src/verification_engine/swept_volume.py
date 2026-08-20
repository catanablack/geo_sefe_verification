"""Swept-volume collision analysis.

Computes the 3D volume swept by the vehicle's geometric footprint as it moves
along a candidate trajectory, for intersection testing against occupied
voxels and forecasted dynamic-agent footprints.
"""
from __future__ import annotations

from typing import Sequence

import numpy as np

from src.common.types import Trajectory, VoxelGrid


class SweptVolumeAnalyzer:
    """Builds and tests the swept volume of a vehicle footprint along a trajectory."""

    def __init__(self, vehicle_footprint_xy: np.ndarray) -> None:
        """`vehicle_footprint_xy`: (N, 2) polygon vertices of the vehicle footprint
        in the vehicle's local frame (extruded vertically for 3D swept volume)."""
        self.vehicle_footprint_xy = vehicle_footprint_xy

    def compute_swept_volume(self, trajectory: Trajectory) -> np.ndarray:
        """Return a voxel mask (or mesh, depending on backend) representing the
        union of vehicle footprints over all waypoints in `trajectory`.

        TODO(phase-1): interpolate footprint pose between waypoints and
        rasterize/union into either a voxel mask (matching VoxelGrid
        resolution) or a triangle mesh (for SDF-based distance queries).
        """
        raise NotImplementedError

    def min_clearance_to_occupancy(
        self, trajectory: Trajectory, occupancy: VoxelGrid
    ) -> float:
        """Return the minimum clearance (meters) between the swept volume and
        occupied voxels in `occupancy`. Negative values indicate penetration."""
        raise NotImplementedError
