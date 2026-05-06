from panda3d.core import CardMaker, Vec3


class FormulaCar:
    """Simple physics-driven formula car actor."""

    def __init__(self, parent_node, loader, model_path=None):
        self.node = parent_node.attachNewNode("formula_car")
        self.visual = self._load_visual(loader, model_path)
        self.visual.reparentTo(self.node)
        self.visual.setScale(0.7, 1.6, 0.35)
        self.visual.setZ(0.35)

        self.velocity = 0.0

        # Tunable movement parameters
        self.max_forward_speed = 80.0
        self.max_reverse_speed = -25.0
        self.acceleration = 45.0
        self.brake_acceleration = 60.0
        self.drag = 18.0

        self.max_steer_rate = 120.0  # deg/sec at low speed
        self.min_steer_rate = 28.0   # deg/sec at high speed

    def _load_visual(self, loader, model_path=None):
        """
        Loads a placeholder box if no model is provided.

        To swap in a real car model later:
        1) Export a model as .egg or .gltf/.glb.
        2) Set model_path to that file (e.g. "models/formula_car.gltf").
        3) Adjust setScale/setPos/setHpr to fit your asset orientation and size.
        """
        if model_path:
            return loader.loadModel(model_path)

        cm = CardMaker("car_box")
        cm.setFrame(-0.8, 0.8, -0.35, 0.35)
        body = self.node.attachNewNode(cm.generate())
        body.setP(-90)
        body.setColor(0.88, 0.1, 0.1, 1.0)

        # Add a second card for a little shape variation.
        cm_top = CardMaker("car_top")
        cm_top.setFrame(-0.45, 0.45, -0.18, 0.18)
        top = self.node.attachNewNode(cm_top.generate())
        top.setP(-90)
        top.setZ(0.28)
        top.setColor(0.95, 0.95, 0.95, 1.0)

        return self.node

    def update(self, dt, controls):
        accelerating = controls["accelerate"]
        braking = controls["brake"]

        if accelerating:
            self.velocity += self.acceleration * dt
        elif braking:
            self.velocity -= self.brake_acceleration * dt
        else:
            # Friction/drag to naturally reduce speed to 0.
            if self.velocity > 0:
                self.velocity = max(0.0, self.velocity - self.drag * dt)
            elif self.velocity < 0:
                self.velocity = min(0.0, self.velocity + self.drag * dt)

        self.velocity = max(self.max_reverse_speed, min(self.velocity, self.max_forward_speed))

        # Steering effectiveness depends on speed (smaller turn rate at high speed).
        speed_ratio = min(abs(self.velocity) / self.max_forward_speed, 1.0)
        steer_rate = self.max_steer_rate + (self.min_steer_rate - self.max_steer_rate) * speed_ratio

        steer_input = 0.0
        if controls["left"]:
            steer_input += 1.0
        if controls["right"]:
            steer_input -= 1.0

        # Reverse steering flips naturally when moving backward.
        direction = 1.0 if self.velocity >= 0.0 else -1.0
        self.node.setH(self.node.getH() + steer_input * steer_rate * dt * direction)

        forward = self.node.getQuat().getForward()
        self.node.setPos(self.node.getPos() + Vec3(forward) * self.velocity * dt)
