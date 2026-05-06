from panda3d.core import CardMaker


class WorldBuilder:
    """Builds a simple flat environment with track and grass."""

    def __init__(self, render):
        self.render = render

    def build(self):
        self._create_grass()
        self._create_track()

    def _create_grass(self):
        cm = CardMaker("grass")
        cm.setFrame(-220, 220, -220, 220)
        grass = self.render.attachNewNode(cm.generate())
        grass.setP(-90)
        grass.setColor(0.16, 0.56, 0.2, 1.0)

    def _create_track(self):
        cm = CardMaker("track")
        cm.setFrame(-60, 60, -130, 130)
        track = self.render.attachNewNode(cm.generate())
        track.setP(-90)
        track.setZ(0.02)
        track.setColor(0.38, 0.38, 0.38, 1.0)
