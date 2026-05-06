class InputController:
    """Tracks keyboard state for smooth continuous controls."""

    def __init__(self, showbase):
        self.base = showbase
        self.keys = {
            "accelerate": False,
            "brake": False,
            "left": False,
            "right": False,
        }
        self._bind_keys()

    def _bind_keys(self):
        self.base.accept("w", self._set_key, ["accelerate", True])
        self.base.accept("w-up", self._set_key, ["accelerate", False])

        self.base.accept("s", self._set_key, ["brake", True])
        self.base.accept("s-up", self._set_key, ["brake", False])

        self.base.accept("a", self._set_key, ["left", True])
        self.base.accept("a-up", self._set_key, ["left", False])

        self.base.accept("d", self._set_key, ["right", True])
        self.base.accept("d-up", self._set_key, ["right", False])

        self.base.accept("escape", self.base.userExit)

    def _set_key(self, key, value):
        self.keys[key] = value
