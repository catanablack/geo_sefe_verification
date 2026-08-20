"""Backend service layer: exposes the platform's engines over REST/WebSocket.

No engine logic lives here — this package only wires `spatial_fusion`,
`predictive_occupancy`, `verification_engine`, and `trajectory_arbitration`
into HTTP/WebSocket endpoints consumed by the `frontend` dashboard and by
partner integrations.
"""
