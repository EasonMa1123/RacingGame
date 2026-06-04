import * as THREE from 'three';

const canvas = document.querySelector('#game-canvas');
const hud = {
  speed: document.querySelector('#speed'),
  gear: document.querySelector('#gear'),
  rpm: document.querySelector('#rpm-value'),
  rpmBar: document.querySelector('#rpm-bar'),
  lap: document.querySelector('#lap-counter'),
  lapTime: document.querySelector('#lap-time'),
  bestLap: document.querySelector('#best-lap'),
  status: document.querySelector('#connection-status'),
  minimap: document.querySelector('#minimap'),
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x08111f, 0.0065);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 1800);
camera.position.set(0, 8, -16);

const clock = new THREE.Clock();
const minimapContext = hud.minimap.getContext('2d');

const keys = new Set();
let cameraMode = 'chase';
let telemetrySocket = null;
let telemetryTimer = 0;

const track = createTrackDefinition();
const car = createFormulaCar();
scene.add(car.group);
car.group.position.copy(track.centerPoints[0]).add(new THREE.Vector3(0, 0.55, 0));
car.heading = Math.atan2(track.centerPoints[1].x - track.centerPoints[0].x, track.centerPoints[1].z - track.centerPoints[0].z);

initLighting();
createWorld(track);
connectTelemetry();

window.addEventListener('resize', onResize);
window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if (event.key.toLowerCase() === 'c') cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

animate();

function initLighting() {
  scene.background = new THREE.Color(0x07111f);
  const hemi = new THREE.HemisphereLight(0xb9dcff, 0x17220f, 1.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 3.1);
  sun.position.set(-90, 130, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  scene.add(sun);
}

function createTrackDefinition() {
  const points = [
    new THREE.Vector3(0, 0, -105), new THREE.Vector3(72, 0, -86), new THREE.Vector3(116, 0, -35),
    new THREE.Vector3(96, 0, 42), new THREE.Vector3(38, 0, 92), new THREE.Vector3(-40, 0, 78),
    new THREE.Vector3(-104, 0, 32), new THREE.Vector3(-94, 0, -50), new THREE.Vector3(-45, 0, -96),
  ];
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.45);
  const centerPoints = curve.getSpacedPoints(620);
  return { curve, centerPoints, width: 16, lapsToWin: 3 };
}

function createWorld(trackDef) {
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x173d1f, roughness: 0.92 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 760, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  buildRibbon(trackDef.centerPoints, trackDef.width, new THREE.MeshStandardMaterial({ color: 0x242833, roughness: 0.78, metalness: 0.08 }), 0.032);
  buildRibbon(trackDef.centerPoints, trackDef.width + 5, new THREE.MeshStandardMaterial({ color: 0x10131a, roughness: 0.8 }), 0.018, true);
  createKerbs(trackDef);
  createStartLine(trackDef);
  createBarriers(trackDef);
  createGrandstands();
  createSkyline();
}

function buildRibbon(points, width, material, y, underneath = false) {
  const vertices = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const next = points[(i + 1) % points.length];
    const prev = points[(i - 1 + points.length) % points.length];
    const tangent = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const half = width / 2;
    vertices.push(p.x + normal.x * half, y, p.z + normal.z * half, p.x - normal.x * half, y, p.z - normal.z * half);
    uvs.push(0, i / 14, 1, i / 14);
  }
  for (let i = 0; i < points.length; i++) {
    const a = i * 2, b = ((i + 1) % points.length) * 2;
    underneath ? indices.push(a, b + 1, b, a, a + 1, b + 1) : indices.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function createKerbs(trackDef) {
  const red = new THREE.MeshStandardMaterial({ color: 0xe91534, roughness: 0.44 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf8f8f4, roughness: 0.36 });
  for (let i = 0; i < trackDef.centerPoints.length; i += 10) {
    const p = trackDef.centerPoints[i];
    const next = trackDef.centerPoints[(i + 1) % trackDef.centerPoints.length];
    const prev = trackDef.centerPoints[(i - 1 + trackDef.centerPoints.length) % trackDef.centerPoints.length];
    const tangent = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    [-1, 1].forEach((side) => {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.18, 1.4), i % 20 === 0 ? red : white);
      kerb.position.copy(p).add(normal.clone().multiplyScalar(side * (trackDef.width / 2 + 0.75)));
      kerb.position.y = 0.14;
      kerb.rotation.y = Math.atan2(tangent.x, tangent.z);
      kerb.castShadow = true;
      kerb.receiveShadow = true;
      scene.add(kerb);
    });
  }
}

function createStartLine(trackDef) {
  const p = trackDef.centerPoints[0];
  const next = trackDef.centerPoints[1];
  const tangent = next.clone().sub(p).normalize();
  const line = new THREE.Mesh(new THREE.BoxGeometry(trackDef.width, 0.06, 2.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  line.position.copy(p);
  line.position.y = 0.09;
  line.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI / 2;
  scene.add(line);
}

function createBarriers(trackDef) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xcfd5dc, roughness: 0.32, metalness: 0.35 });
  for (let i = 0; i < trackDef.centerPoints.length; i += 18) {
    const p = trackDef.centerPoints[i];
    const next = trackDef.centerPoints[(i + 1) % trackDef.centerPoints.length];
    const prev = trackDef.centerPoints[(i - 1 + trackDef.centerPoints.length) % trackDef.centerPoints.length];
    const tangent = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    [-1, 1].forEach((side) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(7, 1.25, 0.55), mat);
      rail.position.copy(p).add(normal.clone().multiplyScalar(side * (trackDef.width / 2 + 5.2)));
      rail.position.y = 0.85;
      rail.rotation.y = Math.atan2(tangent.x, tangent.z);
      rail.castShadow = true;
      scene.add(rail);
    });
  }
}

function createGrandstands() {
  const standMat = new THREE.MeshStandardMaterial({ color: 0x2e3647, roughness: 0.68, metalness: 0.15 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0xd91434, roughness: 0.56 });
  [[-68, -128, 0.15], [96, 82, -0.85]].forEach(([x, z, yaw]) => {
    const group = new THREE.Group();
    for (let row = 0; row < 5; row++) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(72, 2.8, 5.5), row % 2 ? seatMat : standMat);
      deck.position.set(0, row * 1.25, row * -3);
      deck.castShadow = true;
      group.add(deck);
    }
    group.position.set(x, 1.1, z);
    group.rotation.y = yaw;
    scene.add(group);
  });
}

function createSkyline() {
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.2 });
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2;
    const radius = 260 + Math.random() * 70;
    const height = 20 + Math.random() * 70;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(10 + Math.random() * 18, height, 10 + Math.random() * 18), towerMat);
    tower.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
    scene.add(tower);
  }
}

function createFormulaCar() {
  const group = new THREE.Group();
  const redPaint = new THREE.MeshPhysicalMaterial({ color: 0xd80f2e, metalness: 0.62, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x08090d, metalness: 0.5, roughness: 0.3 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.82 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.24, metalness: 0.2 });

  addBox(group, [0, 0.65, 0], [1.45, 0.38, 5.2], redPaint);
  addBox(group, [0, 0.92, -0.2], [0.62, 0.48, 2.0], redPaint);
  addBox(group, [0, 1.18, -0.52], [0.48, 0.3, 0.78], carbon);
  addBox(group, [0, 0.52, 3.15], [3.35, 0.22, 0.72], carbon);
  addBox(group, [0, 0.72, -3.05], [3.1, 0.28, 0.84], carbon);
  addBox(group, [0, 1.48, -2.58], [2.3, 0.62, 0.18], redPaint);
  addBox(group, [0, 1.15, -2.75], [0.28, 1.15, 0.24], redPaint);
  addBox(group, [0, 0.9, 1.65], [0.35, 0.28, 1.7], accent);
  addWheel(group, [-1.35, 0.52, 1.85], tireMat);
  addWheel(group, [1.35, 0.52, 1.85], tireMat);
  addWheel(group, [-1.45, 0.52, -1.85], tireMat);
  addWheel(group, [1.45, 0.52, -1.85], tireMat);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.045, 8, 28, Math.PI * 1.25), carbon);
  halo.position.set(0, 1.45, -0.52);
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  return {
    group, velocity: 0, lateralVelocity: 0, heading: 0, steerVisual: 0,
    lap: 1, lastProgress: 0, lapStart: performance.now(), bestLap: null, lastLapTime: null,
  };
}

function addBox(parent, position, scale, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(scale[0], scale[1], scale[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addWheel(parent, position, material) {
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.46, 32), material);
  tire.position.set(position[0], position[1], position[2]);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  parent.add(tire);
  return tire;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const input = readInput();
  updatePhysics(dt, input);
  updateCamera(dt);
  updateHUD(input);
  drawMinimap();
  sendTelemetry(dt);
  renderer.render(scene, camera);
}

function readInput() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const pad = pads[0];
  let throttle = keys.has('w') || keys.has('arrowup') ? 1 : 0;
  let brake = keys.has('s') || keys.has('arrowdown') ? 1 : 0;
  let steer = (keys.has('a') || keys.has('arrowleft') ? -1 : 0) + (keys.has('d') || keys.has('arrowright') ? 1 : 0);

  if (pad) {
    steer = applyDeadzone(pad.axes[0] ?? steer, 0.08);
    const rtButton = pad.buttons[7]?.value ?? 0;
    const ltButton = pad.buttons[6]?.value ?? 0;
    const rtAxis = normalizeTriggerAxis(pad.axes[5]);
    const ltAxis = normalizeTriggerAxis(pad.axes[4]);
    throttle = Math.max(throttle, rtButton, rtAxis);
    brake = Math.max(brake, ltButton, ltAxis);
  }
  return { throttle, brake, steer: THREE.MathUtils.clamp(steer, -1, 1) };
}

function normalizeTriggerAxis(axis) {
  if (axis === undefined) return 0;
  return THREE.MathUtils.clamp((axis + 1) / 2, 0, 1);
}

function applyDeadzone(value, deadzone) {
  if (Math.abs(value) < deadzone) return 0;
  return THREE.MathUtils.clamp(value, -1, 1);
}

function updatePhysics(dt, input) {
  const maxSpeed = 93; // meters/sec, approximately 208 mph.
  const reverseMax = -15;
  const accel = 42 * (1 - Math.min(Math.max(car.velocity, 0) / maxSpeed, 0.78));
  const braking = car.velocity > 0 ? 72 : 34;
  const drag = 0.018 * car.velocity * Math.abs(car.velocity) + 5.2 * car.velocity;

  car.velocity += input.throttle * accel * dt;
  car.velocity -= input.brake * braking * dt;
  car.velocity -= drag * dt;
  car.velocity = THREE.MathUtils.clamp(car.velocity, reverseMax, maxSpeed);

  const speed01 = Math.min(Math.abs(car.velocity) / maxSpeed, 1);
  const steeringLock = THREE.MathUtils.lerp(1.25, 0.36, speed01);
  const slipAssist = THREE.MathUtils.lerp(1.0, 0.58, speed01);
  const steerAngle = input.steer * steeringLock;
  car.heading -= steerAngle * car.velocity * 0.028 * dt;
  car.heading += car.lateralVelocity * 0.0025 * dt;
  car.lateralVelocity += input.steer * speed01 * 18 * dt;
  car.lateralVelocity *= Math.pow(0.18 + slipAssist * 0.72, dt * 6);

  const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  car.group.position.addScaledVector(forward, car.velocity * dt);
  car.group.position.addScaledVector(right, car.lateralVelocity * dt);
  car.group.position.y = 0.55;
  car.group.rotation.set(0, car.heading, -input.steer * 0.08 - car.lateralVelocity * 0.014);

  const trackState = getTrackState(car.group.position);
  if (trackState.distance > track.width / 2 + 1.8) {
    car.velocity *= Math.pow(0.36, dt);
    car.lateralVelocity *= Math.pow(0.2, dt);
  }
  handleLap(trackState.progress);
}

function getTrackState(position) {
  let bestDistance = Infinity;
  let bestIndex = 0;
  for (let i = 0; i < track.centerPoints.length; i += 3) {
    const distance = position.distanceTo(track.centerPoints[i]);
    if (distance < bestDistance) { bestDistance = distance; bestIndex = i; }
  }
  return { distance: bestDistance, progress: bestIndex / track.centerPoints.length, point: track.centerPoints[bestIndex] };
}

function handleLap(progress) {
  if (car.lastProgress > 0.86 && progress < 0.14 && Math.abs(car.velocity) > 8) {
    const now = performance.now();
    car.lastLapTime = now - car.lapStart;
    car.bestLap = car.bestLap === null ? car.lastLapTime : Math.min(car.bestLap, car.lastLapTime);
    car.lapStart = now;
    car.lap = Math.min(track.lapsToWin, car.lap + 1);
    car.lapCompleted = true;
  } else {
    car.lapCompleted = false;
  }
  car.lastProgress = progress;
}

function updateCamera(dt) {
  const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const speed01 = Math.min(Math.abs(car.velocity) / 93, 1);
  const targetFov = cameraMode === 'cockpit' ? 78 + speed01 * 10 : 62 + speed01 * 18;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();

  let desired;
  let lookAt;
  if (cameraMode === 'cockpit') {
    desired = car.group.position.clone().addScaledVector(forward, 0.7).add(new THREE.Vector3(0, 1.35, 0));
    lookAt = desired.clone().addScaledVector(forward, 22).add(new THREE.Vector3(0, 1.5, 0));
  } else {
    desired = car.group.position.clone().addScaledVector(forward, -THREE.MathUtils.lerp(10, 17, speed01)).add(new THREE.Vector3(0, THREE.MathUtils.lerp(5.4, 7.2, speed01), 0));
    lookAt = car.group.position.clone().addScaledVector(forward, 12).add(new THREE.Vector3(0, 1.4, 0));
  }
  camera.position.lerp(desired, 1 - Math.exp(-dt * 6.5));
  camera.lookAt(lookAt);
}

function updateHUD() {
  const mph = Math.max(0, Math.round(car.velocity * 2.23694));
  const gear = mph < 2 ? 'N' : Math.min(8, Math.max(1, Math.floor(mph / 27) + 1));
  const rpm = gear === 'N' ? 1100 : Math.round(3200 + ((mph % 27) / 27) * 8800);
  const rpmPercent = THREE.MathUtils.clamp((rpm - 1000) / 11000, 0, 1) * 100;

  hud.speed.textContent = mph.toString();
  hud.gear.textContent = gear.toString();
  hud.rpm.textContent = rpm.toString();
  hud.rpmBar.firstElementChild.style.width = `${rpmPercent}%`;
  hud.rpmBar.classList.toggle('redline', rpm > 10500);
  hud.lap.textContent = `${car.lap} / ${track.lapsToWin}`;
  hud.lapTime.textContent = formatTime(performance.now() - car.lapStart);
  hud.bestLap.textContent = car.bestLap ? formatTime(car.bestLap) : '--:--.---';
}

function drawMinimap() {
  const ctx = minimapContext;
  ctx.clearRect(0, 0, hud.minimap.width, hud.minimap.height);
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.beginPath();
  track.centerPoints.forEach((p, i) => {
    const [x, y] = worldToMap(p);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ff173d';
  ctx.stroke();

  const [carX, carY] = worldToMap(car.group.position);
  ctx.fillStyle = '#58e6ff';
  ctx.shadowColor = '#58e6ff';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(carX, carY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function worldToMap(point) {
  return [point.x * 0.72 + hud.minimap.width / 2, point.z * 0.52 + hud.minimap.height / 2];
}

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function connectTelemetry() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  telemetrySocket = new WebSocket(`${protocol}://${location.host}/ws/telemetry`);
  telemetrySocket.addEventListener('open', () => { hud.status.textContent = 'Online'; });
  telemetrySocket.addEventListener('close', () => {
    hud.status.textContent = 'Offline';
    setTimeout(connectTelemetry, 2500);
  });
  telemetrySocket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'session') hud.status.textContent = `Online ${message.sessionId.slice(0, 4)}`;
  });
}

function sendTelemetry(dt) {
  telemetryTimer += dt;
  if (!telemetrySocket || telemetrySocket.readyState !== WebSocket.OPEN || telemetryTimer < 0.2) return;
  telemetryTimer = 0;
  telemetrySocket.send(JSON.stringify({
    type: 'telemetry',
    payload: {
      speedMph: Math.max(0, car.velocity * 2.23694),
      lap: car.lap,
      lapCompleted: car.lapCompleted,
      lastLapTime: car.lastLapTime,
      position: { x: car.group.position.x, z: car.group.position.z },
      heading: car.heading,
    },
  }));
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
