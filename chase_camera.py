from panda3d.core import Vec3


class ChaseCamera:
    """Smooth third-person camera that follows the car from behind."""

    def __init__(self, camera_node, target_node):
        self.camera = camera_node
        self.target = target_node

        self.distance_back = 14.0
        self.height = 5.5
        self.look_at_height = 1.5
        self.lerp_speed = 7.5

    def update(self, dt):
        forward = self.target.getQuat().getForward()
        desired_pos = (
            self.target.getPos()
            - Vec3(forward) * self.distance_back
            + Vec3(0, 0, self.height)
        )

        # Lerp camera position to avoid jitter / snapping.
        blend = min(1.0, dt * self.lerp_speed)
        current = self.camera.getPos()
        self.camera.setPos(current + (desired_pos - current) * blend)

        look_at_point = self.target.getPos() + Vec3(0, 0, self.look_at_height)
        self.camera.lookAt(look_at_point)
