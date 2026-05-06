from direct.showbase.ShowBase import ShowBase
from direct.task import Task

from chase_camera import ChaseCamera
from input_controller import InputController
from vehicle import FormulaCar
from world import WorldBuilder


class FormulaRacingGame(ShowBase):
    def __init__(self):
        super().__init__()

        self.disableMouse()

        # Build environment.
        self.world = WorldBuilder(self.render)
        self.world.build()

        # Create player car.
        self.car = FormulaCar(self.render, self.loader, model_path=None)
        self.car.node.setPos(0, 0, 0)

        # Set up controls + chase camera.
        self.input = InputController(self)
        self.chase_camera = ChaseCamera(self.camera, self.car.node)
        self.camera.setPos(0, -18, 7)

        self.taskMgr.add(self._update, "update_game")

    def _update(self, task: Task):
        dt = globalClock.getDt()

        self.car.update(dt, self.input.keys)
        self.chase_camera.update(dt)

        return Task.cont
