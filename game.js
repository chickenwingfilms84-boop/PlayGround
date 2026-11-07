import * as THREE from "./vendor/three.module.min.js";
import { AudioEngine } from "./js/audio.js";

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries([
  "game-canvas", "hud", "menu", "pause", "gameover", "play-btn", "resume-btn", "quit-btn", "restart-btn", "menu-btn", "sound-btn", "touch-controls", "touch-fire", "touch-reload", "touch-jump", "touch-ads", "touch-pause", "stick-zone", "stick-thumb", "touch-look", "wave-num", "wave-state", "score", "combo", "kill-feed", "center-alert", "alert-kicker", "alert-title", "alert-sub", "objective-text", "hitmarker", "reload-hint", "damage-arc", "shield", "shield-bar", "hp", "hp-bar", "mag", "reserve", "reload-bar", "weapon-mode", "radar", "toast-stack", "damage-numbers", "damage-vignette", "best-score", "pause-wave", "pause-score", "pause-kills", "final-score", "final-wave", "final-kills", "final-accuracy", "new-best", "loading"
].map((id) => [id, $(id)]));
const audio = new AudioEngine();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050812);
scene.fog = new THREE.FogExp2(0x050812, 0.012);
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.08, 180);
const renderer = new THREE.WebGLRenderer({ canvas: ui["game-canvas"], antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

let state = "menu";
let wave = 0, score = 0, kills = 0, shots = 0, hits = 0;
let hp = 100, shield = 50, ammo = 30, reserve = 210;
let yaw = 0, pitch = 0, reloading = false, reloadTime = 0, fireHeld = false, aimHeld = false;
let spawnLeft = 0, spawnTimer = 0, waveBreak = 0, alertTimer = 0, hitTimer = 0, damageFlash = 0;
let lastTime = performance.now(), elapsed = 0, bob = 0, footTimer = 0, shotCooldown = 0, comboTimer = 0, comboCount = 0;
let velocityY = 0, onGround = true, moveVector = new THREE.Vector2(), touchMove = new THREE.Vector2();
const keys = new Set(), enemies = [], pickups = [], effects = [], obstacles = [];
const raycaster = new THREE.Raycaster();
const cameraForward = new THREE.Vector3();
let core = null;
const player = new THREE.Vector3(0, 0, 18);
const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const bestKey = "neon-breach-best";

function mat(color, emissive = color, intensity = 0.2, roughness = 0.72) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness, metalness: 0.34 });
}
function addBox(parent, x, y, z, sx, sy, sz, material, cast = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function addGlow(x, y, z, color, size = 0.15) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color }));
  mesh.position.set(x, y, z); scene.add(mesh); return mesh;
}

function buildArena() {
  scene.add(new THREE.HemisphereLight(0x79dfff, 0x101324, 1.2));
  const key = new THREE.DirectionalLight(0x8beaff, 2.2); key.position.set(-7, 18, 8); scene.add(key);
  const pinkLight = new THREE.PointLight(0xff267f, 35, 38, 2); pinkLight.position.set(13, 5, -12); scene.add(pinkLight);
  const cyanLight = new THREE.PointLight(0x00d9ff, 32, 34, 2); cyanLight.position.set(-14, 5, 6); scene.add(cyanLight);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), mat(0x111a2a, 0x07121d, 0.5));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.035; scene.add(floor);
  const grid = new THREE.GridHelper(90, 60, 0x167a91, 0x173349); grid.position.y = 0.012;
  grid.material.transparent = true; grid.material.opacity = 0.38; scene.add(grid);
  const outer = mat(0x121a29, 0x101a2d, 0.45), trim = new THREE.MeshBasicMaterial({ color: 0x20ddf5 });
  // Perimeter bulkheads and illuminated top rails create a compact industrial arena.
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, x = Math.sin(a) * 31, z = Math.cos(a) * 31;
    const wall = addBox(scene, x, 5, z, 62, 10, 1.2, outer);
    wall.rotation.y = a;
    const rail = addBox(scene, x, 8.5, z, 62, 0.11, 1.35, trim); rail.rotation.y = a;
    for (let j = -2; j <= 2; j++) {
      const p = addBox(scene, x + Math.cos(a) * j * 10, 3.8, z - Math.sin(a) * j * 10, 0.14, 7.6, 0.18, mat(0x22334b, 0x18263b, 0.3)); p.rotation.y = a;
    }
  }
  const columnMat = mat(0x202c40, 0x0b2433, 0.8), cyan = new THREE.MeshBasicMaterial({ color: 0x19dff7 }), magenta = new THREE.MeshBasicMaterial({ color: 0xff318f });
  const positions = [[-13,-11],[13,-11],[-13,3],[13,3],[-7,-23],[7,-23],[-22,-1],[22,-1]];
  positions.forEach(([x,z], i) => {
    const col = addBox(scene, x, 2.25, z, 1.8, 4.5, 1.8, columnMat);
    addBox(scene, x, 3.85, z + 0.93, 1.25, 0.12, 0.08, i % 2 ? magenta : cyan);
    obstacles.push({ x, z, r: 1.2 });
    const beacon = new THREE.PointLight(i % 2 ? 0xff258a : 0x05dbff, 5, 8, 2); beacon.position.set(x, 4, z); scene.add(beacon);
    col.userData.decor = true;
  });
  // A low central reactor, readable as cover without blocking the whole sightline.
  const reactor = addBox(scene, 0, 0.95, -2, 4.6, 1.9, 4.6, mat(0x17263b, 0x0a3446, 1));
  addBox(scene, 0, 1.94, -2, 4.9, 0.12, 4.9, cyan);
  core = new THREE.Mesh(new THREE.OctahedronGeometry(0.78, 0), new THREE.MeshBasicMaterial({ color: 0x70faff, wireframe: true }));
  core.position.set(0, 3.1, -2); scene.add(core);
  const coreGlow = new THREE.PointLight(0x39eaff, 12, 16, 2); coreGlow.position.set(0, 3, -2); scene.add(coreGlow);
  reactor.userData.decor = true;
  // Sparse cover crates around the edges.
  [[-21,-16],[21,-16],[-22,16],[22,14],[0,-25]].forEach(([x,z], i) => {
    addBox(scene, x, 0.7, z, 3.2, 1.4, 2.6, mat(0x182338, 0x0b1c2d, 0.55));
    const stripe = addBox(scene, x, 1.42, z, 2.7, 0.05, 0.06, i % 2 ? magenta : cyan);
    stripe.userData.decor = true; obstacles.push({ x, z, r: 1.8 });
  });
  for (let i = 0; i < 50; i++) {
    const x = (Math.random() - 0.5) * 82, z = -Math.random() * 45 - 8;
    const h = 2 + Math.random() * 13, w = 1.2 + Math.random() * 3;
    addBox(scene, x, h / 2 - 0.2, z, w, h, w, mat(0x101a2c, 0x070d18, 0.35));
    if (i % 3 === 0) addBox(scene, x, h * 0.62, z + w / 2 + 0.015, w * 0.6, 0.06, 0.035, i % 2 ? cyan : magenta);
  }
}
buildArena();

camera.rotation.order = "YXZ";
scene.add(camera);

function setState(next) {
  state = next;
  ui.hud.classList.toggle("is-hidden", next !== "playing" && next !== "paused");
  ui.hud.setAttribute("aria-hidden", String(next !== "playing" && next !== "paused"));
  ui.menu.classList.toggle("is-hidden", next !== "menu");
  ui.pause.classList.toggle("is-hidden", next !== "paused");
  ui.gameover.classList.toggle("is-hidden", next !== "gameover");
  ui["touch-controls"].classList.toggle("is-hidden", next !== "playing" || !isTouch);
  document.body.classList.toggle("is-touch", isTouch && next === "playing");
  if (next !== "playing") { fireHeld = false; aimHeld = false; touchJump = false; touchMove.set(0, 0); keys.clear(); }
}
function showAlert(kicker, title, sub, tone = "") {
  ui["alert-kicker"].textContent = kicker; ui["alert-title"].textContent = title; ui["alert-sub"].textContent = sub;
  ui["center-alert"].className = `center-alert show ${tone}`; alertTimer = 2.7;
}
function toast(text, tone = "") {
  const node = document.createElement("div"); node.className = `toast ${tone}`; node.textContent = text;
  ui["toast-stack"].append(node); setTimeout(() => node.remove(), 2500);
}
function fmt(n) { return Math.floor(n).toString().padStart(6, "0"); }
function updateHUD() {
  ui["wave-num"].textContent = String(Math.max(1, wave)).padStart(2, "0");
  ui.score.textContent = fmt(score); ui.hp.textContent = Math.ceil(hp); ui.shield.textContent = Math.ceil(shield);
  ui["hp-bar"].style.width = `${hp}%`; ui["shield-bar"].style.width = `${shield * 2}%`;
  ui.mag.textContent = ammo; ui.reserve.textContent = reserve;
  ui["reload-bar"].style.width = reloading ? `${Math.min(100, (1 - reloadTime / 1.25) * 100)}%` : "0%";
  ui["reload-hint"].classList.toggle("show", ammo <= 6 && reserve > 0 && !reloading);
  ui["weapon-mode"].textContent = aimHeld ? "PULSE / FOCUSED" : "PULSE / AUTO";
  document.body.classList.toggle("is-critical", hp <= 30);
  ui.combo.querySelector("b").textContent = `x${(1 + Math.min(comboCount, 10) * 0.1).toFixed(1)}`;
  ui["best-score"].textContent = fmt(Math.max(score, Number(localStorage.getItem(bestKey) || 0)));
  ui["wave-state"].textContent = spawnLeft > 0 ? "HOSTILES DETECTED" : enemies.length ? "ELIMINATE REMAINING HOSTILES" : "SECTOR SECURE";
  drawRadar();
}

const enemyMats = {
  shell: mat(0x26374a, 0x18384a, 0.9), glow: new THREE.MeshBasicMaterial({ color: 0xff3d91 }), eye: new THREE.MeshBasicMaterial({ color: 0xb9fbff }),
  heavy: mat(0x4a263d, 0x60163b, 0.8), elite: mat(0x273b4d, 0x15708b, 1.1)
};
function spawnEnemy() {
  const angle = Math.random() * Math.PI * 2, radius = 24 + Math.random() * 4;
  const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
  const type = wave >= 4 && Math.random() < 0.18 ? "elite" : wave >= 2 && Math.random() < 0.28 ? "heavy" : "drone";
  const group = new THREE.Group(); group.position.set(x, 0, z); scene.add(group);
  const scale = type === "heavy" ? 1.18 : type === "elite" ? 1.05 : 1;
  const shell = type === "heavy" ? enemyMats.heavy : type === "elite" ? enemyMats.elite : enemyMats.shell;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9 * scale, 1.15 * scale, 0.52 * scale), shell); torso.position.y = 1.15 * scale; group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34 * scale, 12, 9), shell); head.position.y = 1.98 * scale; group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.52 * scale, 0.1 * scale, 0.08), enemyMats.glow); visor.position.set(0, 2 * scale, -0.29 * scale); group.add(visor);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.19 * scale, 0.045, 0.03), enemyMats.eye); eye.position.set(0, 2.01 * scale, -0.34 * scale); group.add(eye);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.23 * scale, 0.9 * scale, 0.24), shell); arm.position.set(side * 0.61 * scale, 1.15 * scale, 0); group.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3 * scale, 0.76 * scale, 0.34), shell); leg.position.set(side * 0.24 * scale, 0.43 * scale, 0); group.add(leg);
  }
  const health = type === "heavy" ? 145 + wave * 10 : type === "elite" ? 115 + wave * 8 : 68 + wave * 7;
  const enemy = { group, type, hp: health, maxHp: health, speed: (type === "heavy" ? 1.15 : type === "elite" ? 2.25 : 1.65) + Math.min(wave * 0.045, 0.7), attack: 1.2 + Math.random() * 1.5, phase: Math.random() * 8, radius: 0.65 * scale, dead: false };
  group.traverse((part) => { if (part.isMesh) part.userData.enemy = enemy; });
  enemies.push(enemy);
}
function startWave() {
  wave++; spawnLeft = 4 + Math.min(wave * 2, 20); spawnTimer = 0.2; waveBreak = 0;
  ui["objective-text"].textContent = "ELIMINATE ALL HOSTILES";
  showAlert("INCOMING", `WAVE ${String(wave).padStart(2, "0")}`, `${spawnLeft} HOSTILES ENTERING THE SECTOR`);
  audio.waveStart(); updateHUD();
}
function beginRun() {
  audio.init(); audio.resume(); audio.startAmbience();
  enemies.forEach((e) => scene.remove(e.group)); enemies.length = 0;
  pickups.forEach((p) => scene.remove(p.mesh)); pickups.length = 0;
  effects.forEach((e) => scene.remove(e.mesh)); effects.length = 0;
  wave = 0; score = 0; kills = 0; shots = 0; hits = 0; hp = 100; shield = 50; ammo = 30; reserve = 210;
  player.set(0, 0, 18); yaw = 0; pitch = 0; velocityY = 0; onGround = true; reloading = false;
  comboCount = 0; comboTimer = 0; setState("playing"); startWave();
  requestLock();
}
function endRun() {
  if (state !== "playing") return;
  setState("gameover"); document.exitPointerLock?.(); audio.gameOver();
  ui["final-score"].textContent = score.toLocaleString(); ui["final-wave"].textContent = wave;
  ui["final-kills"].textContent = kills; ui["final-accuracy"].textContent = `${shots ? Math.round(hits / shots * 100) : 0}%`;
  const best = Number(localStorage.getItem(bestKey) || 0);
  ui["new-best"].hidden = score <= best;
  if (score > best) localStorage.setItem(bestKey, String(score));
  updateHUD();
}
function pauseRun() {
  if (state !== "playing") return;
  setState("paused"); document.exitPointerLock?.();
  ui["pause-wave"].textContent = String(wave).padStart(2, "0"); ui["pause-score"].textContent = score.toLocaleString(); ui["pause-kills"].textContent = kills;
}
function resumeRun() {
  if (state !== "paused") return;
  audio.resume(); setState("playing");
  if (!isTouch) ui["game-canvas"].requestPointerLock?.();
}
function reload() {
  if (state !== "playing" || reloading || ammo === 30 || reserve <= 0) return;
  reloading = true; reloadTime = 1.25; audio.reloadStart(); updateHUD();
}
function showHitmarker(kill = false) {
  ui.hitmarker.classList.toggle("kill", kill); ui.hitmarker.classList.remove("show");
  void ui.hitmarker.offsetWidth; ui.hitmarker.classList.add("show"); hitTimer = 0.16;
}
function damageEnemy(enemy, amount, headshot = false) {
  if (!enemy || enemy.dead) return;
  enemy.hp -= amount; hits++; audio.hit(headshot); showHitmarker(enemy.hp <= 0);
  const number = document.createElement("span"); number.textContent = Math.round(amount); number.className = "damage-number";
  number.style.left = `${innerWidth / 2 + (Math.random() - 0.5) * 90}px`; number.style.top = `${innerHeight / 2 - 30 + Math.random() * 35}px`; ui["damage-numbers"].append(number); setTimeout(() => number.remove(), 750);
  if (enemy.hp <= 0) killEnemy(enemy);
}
function killEnemy(enemy) {
  enemy.dead = true; scene.remove(enemy.group); enemies.splice(enemies.indexOf(enemy), 1);
  kills++; comboCount++; comboTimer = 4; score += Math.round((enemy.type === "heavy" ? 180 : enemy.type === "elite" ? 220 : 100) * (1 + Math.min(comboCount, 10) * 0.1));
  audio.kill();
  const line = document.createElement("div"); line.className = "feed-entry"; line.innerHTML = `<b>HOSTILE DOWN</b><span>+${enemy.type === "heavy" ? 180 : 100} PTS</span>`; ui["kill-feed"].prepend(line); setTimeout(() => line.remove(), 3400);
  if (Math.random() < 0.23) spawnPickup(enemy.group.position, Math.random() < 0.42 ? "health" : Math.random() < 0.5 ? "shield" : "ammo");
  updateHUD();
}
function spawnPickup(pos, kind) {
  const color = kind === "health" ? 0x60ffab : kind === "shield" ? 0x56eaff : 0xffca5f;
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color, wireframe: true }));
  mesh.position.set(pos.x, 0.75, pos.z); scene.add(mesh);
  pickups.push({ mesh, kind, phase: Math.random() * 6 });
}
function collectPickup(pickup) {
  if (pickup.kind === "health") hp = Math.min(100, hp + 28);
  if (pickup.kind === "shield") shield = Math.min(100, shield + 30);
  if (pickup.kind === "ammo") { reserve = Math.min(300, reserve + 55); if (ammo === 0) reload(); }
  audio.pickup(pickup.kind); toast(`${pickup.kind.toUpperCase()} ${pickup.kind === "health" ? "+28" : pickup.kind === "shield" ? "+30" : "+55"}`, pickup.kind === "health" ? "green" : "amber");
  scene.remove(pickup.mesh); pickups.splice(pickups.indexOf(pickup), 1); updateHUD();
}
function shoot() {
  if (state !== "playing" || reloading || shotCooldown > 0) return;
  if (ammo <= 0) { audio.empty(); if (reserve > 0) reload(); shotCooldown = 0.2; return; }
  ammo--; shots++; shotCooldown = aimHeld ? 0.19 : 0.13; audio.shoot();
  camera.getWorldDirection(cameraForward); raycaster.set(camera.position, cameraForward); raycaster.far = 60;
  const parts = [];
  enemies.forEach((e) => e.group.traverse((o) => { if (o.isMesh) parts.push(o); }));
  const hit = raycaster.intersectObjects(parts, false)[0];
  if (hit) {
    const enemy = hit.object.userData.enemy;
    const headshot = hit.point.y > enemy.group.position.y + 1.72;
    damageEnemy(enemy, headshot ? 62 : 34, headshot);
    if (headshot) score += 15;
  } else {
    // Short cyan tracer streak from the weapon toward the aimed point.
    const end = camera.position.clone().add(cameraForward.clone().multiplyScalar(22));
    const lineGeo = new THREE.BufferGeometry().setFromPoints([camera.position.clone(), end]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x64f8ff, transparent: true, opacity: 0.75 }));
    scene.add(line); effects.push({ mesh: line, life: 0.065, max: 0.065, line: true });
  }
  updateHUD();
}

function drawRadar() {
  const canvas = ui.radar, ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, radius = w * 0.39;
  ctx.clearRect(0, 0, w, h); ctx.save(); ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(111,248,255,.25)"; ctx.lineWidth = 1;
  [0.35, 0.68, 1].forEach((scale) => { ctx.beginPath(); ctx.arc(0, 0, radius * scale, 0, Math.PI * 2); ctx.stroke(); });
  ctx.beginPath(); ctx.moveTo(-radius, 0); ctx.lineTo(radius, 0); ctx.moveTo(0, -radius); ctx.lineTo(0, radius); ctx.stroke();
  ctx.rotate(-yaw);
  enemies.forEach((enemy) => {
    const dx = enemy.group.position.x - player.x, dz = enemy.group.position.z - player.z;
    const scale = radius / 58, x = THREE.MathUtils.clamp(dx * scale, -radius, radius), y = THREE.MathUtils.clamp(dz * scale, -radius, radius);
    ctx.fillStyle = enemy.type === "elite" ? "#60edff" : "#ff3e91"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 7;
    ctx.beginPath(); ctx.arc(x, y, enemy.type === "heavy" ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
  });
  pickups.forEach((p) => { ctx.fillStyle = p.kind === "health" ? "#65ffb1" : p.kind === "shield" ? "#6ff8ff" : "#ffc15c"; ctx.fillRect((p.mesh.position.x - player.x) * radius / 58 - 2, (p.mesh.position.z - player.z) * radius / 58 - 2, 4, 4); });
  ctx.shadowBlur = 0; ctx.fillStyle = "#d9fdff"; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.restore();
}
function hurtPlayer(amount, direction) {
  if (state !== "playing") return;
  let remaining = amount;
  if (shield > 0) { const absorbed = Math.min(shield, remaining); shield -= absorbed; remaining -= absorbed; audio.shieldHit(); }
  if (remaining > 0) { hp = Math.max(0, hp - remaining); audio.hurt(); }
  damageFlash = 0.55; ui["damage-arc"].style.transform = `rotate(${direction}deg)`;
  ui["damage-arc"].classList.remove("flash"); void ui["damage-arc"].offsetWidth; ui["damage-arc"].classList.add("flash");
  ui["damage-vignette"].style.opacity = "0.9"; updateHUD(); if (hp <= 0) endRun();
}
function updateEnemies(dt) {
  for (const enemy of [...enemies]) {
    const epos = enemy.group.position, dx = player.x - epos.x, dz = player.z - epos.z;
    const distance = Math.hypot(dx, dz) || 1; enemy.phase += dt * 5;
    enemy.group.rotation.y = Math.atan2(dx, dz) + Math.PI;
    if (distance > 7) { epos.x += dx / distance * enemy.speed * dt; epos.z += dz / distance * enemy.speed * dt; }
    enemy.group.position.y = Math.sin(enemy.phase) * 0.07; enemy.attack -= dt;
    if (enemy.attack <= 0 && distance < 20) {
      enemy.attack = Math.max(0.7, 2.45 - wave * 0.06) + Math.random() * 0.8; audio.enemyShoot();
      if (distance < 3.5 || Math.random() < Math.max(0.18, 0.58 - distance * 0.015)) {
        const bearing = Math.atan2(epos.x - player.x, epos.z - player.z) * 180 / Math.PI;
        hurtPlayer(enemy.type === "heavy" ? 15 : enemy.type === "elite" ? 12 : 9, bearing);
      }
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: enemy.type === "elite" ? 0x54f6ff : 0xff438d }));
      bolt.position.set(epos.x, 1.45, epos.z); scene.add(bolt); effects.push({ mesh: bolt, life: 0.24, max: 0.24, line: false });
    }
  }
}
function updatePickups(dt) {
  for (const p of [...pickups]) {
    p.phase += dt * 2.4; p.mesh.rotation.y += dt * 1.4; p.mesh.position.y = 0.78 + Math.sin(p.phase) * 0.12;
    if (Math.hypot(player.x - p.mesh.position.x, player.z - p.mesh.position.z) < 1.8) collectPickup(p);
  }
}
function updateMovement(dt) {
  const fwd = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) + touchMove.y;
  const side = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + touchMove.x;
  const len = Math.hypot(fwd, side), moving = len > 0.08, sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  if (moving) {
    const speed = sprint ? 10.2 : 6.4, fx = Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = Math.sin(yaw);
    const dx = (fx * fwd / Math.max(1, len) + rx * side / Math.max(1, len)) * speed * dt;
    const dz = (fz * fwd / Math.max(1, len) + rz * side / Math.max(1, len)) * speed * dt;
    const nx = THREE.MathUtils.clamp(player.x + dx, -27, 27), nz = THREE.MathUtils.clamp(player.z + dz, -27, 27);
    const blocked = obstacles.some((o) => Math.hypot(nx - o.x, nz - o.z) < o.r + 0.42);
    if (!blocked) { player.x = nx; player.z = nz; }
    bob += dt * (sprint ? 14 : 10); footTimer -= dt;
    if (footTimer <= 0) { audio.footstep(sprint); footTimer = sprint ? 0.28 : 0.4; }
  } else bob += dt * 2;
  if ((keys.has("Space") || touchJump) && onGround) { velocityY = 6.4; onGround = false; }
  velocityY -= 17 * dt; player.y += velocityY * dt;
  if (player.y <= 0) { player.y = 0; velocityY = 0; onGround = true; }
  camera.position.set(player.x, 1.62 + player.y + (moving && onGround ? Math.sin(bob) * 0.035 : 0), player.z);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}
function updateEffects(dt) {
  for (const effect of [...effects]) {
    effect.life -= dt;
    if (!effect.line) {
      const direction = player.clone().add(new THREE.Vector3(0, 1.3, 0)).sub(effect.mesh.position).normalize();
      effect.mesh.position.addScaledVector(direction, dt * 28);
    }
    if (effect.life <= 0) { scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); effects.splice(effects.indexOf(effect), 1); }
  }
}

let touchJump = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.04); lastTime = now;
  if (state === "playing") {
    shotCooldown = Math.max(0, shotCooldown - dt);
    if (hitTimer > 0 && (hitTimer -= dt) <= 0) ui.hitmarker.classList.remove("show");
    if (alertTimer > 0 && (alertTimer -= dt) <= 0) ui["center-alert"].classList.remove("show");
    if (damageFlash > 0) { damageFlash -= dt; ui["damage-vignette"].style.opacity = String(Math.max(0, damageFlash / 0.55 * 0.9)); }
    if (comboTimer > 0 && (comboTimer -= dt) <= 0) { comboCount = 0; updateHUD(); }
    if (reloading && (reloadTime -= dt) <= 0) {
      const n = Math.min(30 - ammo, reserve); ammo += n; reserve -= n; reloading = false; audio.reloadEnd(); updateHUD();
    }
    updateMovement(dt); updateEnemies(dt); updatePickups(dt); updateEffects(dt);
    if (spawnLeft > 0 && (spawnTimer -= dt) <= 0) { spawnEnemy(); spawnLeft--; spawnTimer = Math.max(0.42, 1.35 - wave * 0.035); }
    if (spawnLeft === 0 && enemies.length === 0) {
      if (waveBreak <= 0) {
        waveBreak = 4; ui["objective-text"].textContent = "SECTOR SECURE // RESUPPLY INBOUND";
        audio.waveClear(); toast("WAVE CLEARED // + SHIELD", "green"); shield = Math.min(100, shield + 12); updateHUD();
      } else if ((waveBreak -= dt) <= 0) startWave();
    }
    if (fireHeld) shoot();
  }
  if (core) { core.rotation.y += dt * 0.45; core.rotation.x += dt * 0.25; }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

function requestLock() {
  if (isTouch || !ui["game-canvas"].requestPointerLock) return;
  const result = ui["game-canvas"].requestPointerLock();
  result?.catch?.(() => {});
}
function returnToMenu() {
  document.exitPointerLock?.();
  enemies.forEach((e) => scene.remove(e.group)); enemies.length = 0;
  pickups.forEach((p) => scene.remove(p.mesh)); pickups.length = 0;
  effects.forEach((e) => { scene.remove(e.mesh); e.mesh.geometry?.dispose(); e.mesh.material?.dispose(); }); effects.length = 0;
  setState("menu");
  ui["damage-vignette"].style.opacity = "0";
  document.body.classList.remove("is-critical");
}

ui["play-btn"].addEventListener("click", beginRun);
ui["restart-btn"].addEventListener("click", beginRun);
ui["resume-btn"].addEventListener("click", resumeRun);
ui["quit-btn"].addEventListener("click", returnToMenu);
ui["menu-btn"].addEventListener("click", returnToMenu);
ui["sound-btn"].addEventListener("click", () => {
  audio.setEnabled(!audio.enabled);
  document.body.classList.toggle("is-muted", !audio.enabled);
  ui["sound-btn"].setAttribute("aria-pressed", String(!audio.enabled));
});
ui["game-canvas"].addEventListener("click", () => {
  if (state === "playing" && !isTouch && document.pointerLockElement !== ui["game-canvas"]) requestLock();
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === ui["game-canvas"]) hadPointerLock = true;
  else if (hadPointerLock && state === "playing" && !isTouch) pauseRun();
});
let hadPointerLock = false;
document.addEventListener("mousemove", (event) => {
  if (state !== "playing" || isTouch) return;
  if (document.pointerLockElement === ui["game-canvas"]) {
    yaw -= event.movementX * 0.0024;
    pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -1.35, 1.35);
  }
});
document.addEventListener("mousedown", (event) => {
  if (state !== "playing" || isTouch) return;
  if (event.button === 0) { fireHeld = true; audio.resume(); }
  if (event.button === 2) aimHeld = true;
});
document.addEventListener("mouseup", (event) => {
  if (event.button === 0) fireHeld = false;
  if (event.button === 2) aimHeld = false;
});
document.addEventListener("contextmenu", (event) => { if (state === "playing") event.preventDefault(); });
document.addEventListener("keydown", (event) => {
  if (event.code === "Escape" || event.code === "KeyP") {
    event.preventDefault();
    if (state === "playing") pauseRun(); else if (state === "paused") resumeRun();
    return;
  }
  if (state !== "playing") return;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === "KeyR") reload();
});
document.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => { fireHeld = false; aimHeld = false; keys.clear(); });
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
});

function bindHold(button, down, up) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault(); button.classList.add("is-down"); button.setPointerCapture?.(event.pointerId); down();
  });
  const release = (event) => { event.preventDefault(); button.classList.remove("is-down"); up(); };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", () => { button.classList.remove("is-down"); up(); });
}
bindHold(ui["touch-fire"], () => { fireHeld = true; audio.init(); audio.resume(); }, () => { fireHeld = false; });
bindHold(ui["touch-reload"], reload, () => {});
bindHold(ui["touch-jump"], () => { touchJump = true; }, () => { touchJump = false; });
bindHold(ui["touch-ads"], () => { aimHeld = true; }, () => { aimHeld = false; });
ui["touch-pause"].addEventListener("click", pauseRun);

let stickPointer = null;
ui["stick-zone"].addEventListener("pointerdown", (event) => {
  event.preventDefault(); stickPointer = event.pointerId; ui["stick-zone"].setPointerCapture(event.pointerId); updateStick(event);
});
ui["stick-zone"].addEventListener("pointermove", (event) => { if (event.pointerId === stickPointer) updateStick(event); });
function releaseStick(event) {
  if (event.pointerId !== stickPointer) return;
  stickPointer = null; touchMove.set(0, 0);
  ui["stick-thumb"].style.transform = "translate(-50%, -50%)";
}
ui["stick-zone"].addEventListener("pointerup", releaseStick);
ui["stick-zone"].addEventListener("pointercancel", releaseStick);
function updateStick(event) {
  const rect = ui["stick-zone"].getBoundingClientRect();
  const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
  let dx = event.clientX - centerX, dy = event.clientY - centerY;
  const max = 54, length = Math.hypot(dx, dy);
  if (length > max) { dx *= max / length; dy *= max / length; }
  touchMove.set(dx / max, -dy / max);
  ui["stick-thumb"].style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
let lookPointer = null, lastLookX = 0, lastLookY = 0;
ui["touch-look"].addEventListener("pointerdown", (event) => {
  if (!isTouch || state !== "playing") return;
  event.preventDefault(); lookPointer = event.pointerId; lastLookX = event.clientX; lastLookY = event.clientY;
  ui["touch-look"].setPointerCapture(event.pointerId);
});
ui["touch-look"].addEventListener("pointermove", (event) => {
  if (event.pointerId !== lookPointer) return;
  const dx = event.clientX - lastLookX, dy = event.clientY - lastLookY;
  lastLookX = event.clientX; lastLookY = event.clientY;
  yaw -= dx * 0.005; pitch = THREE.MathUtils.clamp(pitch - dy * 0.0045, -1.35, 1.35);
});
const releaseLook = (event) => { if (event.pointerId === lookPointer) lookPointer = null; };
ui["touch-look"].addEventListener("pointerup", releaseLook);
ui["touch-look"].addEventListener("pointercancel", releaseLook);

ui["best-score"].textContent = fmt(Number(localStorage.getItem(bestKey) || 0));
setTimeout(() => ui.loading.classList.add("done"), 420);

