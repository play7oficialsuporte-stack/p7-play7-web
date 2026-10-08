import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

/* ---------- Settings ---------- */
const Settings = { master: .8, amb: .5, sfx: .8, sens: 1, quality: isTouch ? 'low' : 'high', vhs: true,
  bind() {
    $('vM').oninput = e => { this.master = +e.target.value; Audio_.apply(); };
    $('vA').oninput = e => { this.amb = +e.target.value; Audio_.apply(); };
    $('vS').oninput = e => { this.sfx = +e.target.value; Audio_.apply(); };
    $('sens').oninput = e => this.sens = +e.target.value;
    $('qual').value = this.quality; $('qual').onchange = e => { this.quality = e.target.value; Game.applyQuality(); };
    $('bVhs').onclick = () => { this.vhs = !this.vhs; $('vhs').classList.toggle('hide', !this.vhs); $('bVhs').textContent = 'EFEITO VHS: ' + (this.vhs ? 'ON' : 'OFF'); };
  } };

/* ---------- AudioManager: usa arquivos de assets/sounds, com síntese como fallback ---------- */
const Audio_ = {
  ctx: null, buf: {}, 
  async init() {
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.amb = C.createGain(); this.sfx = C.createGain();
    this.amb.connect(this.master); this.sfx.connect(this.master); this.master.connect(C.destination); this.apply();
    const files = ['ambience.mp3', 'footstep1.wav', 'footstep2.wav', 'footstep3.wav', 'footstep4.wav'];
    await Promise.all(files.map(async f => { try {
      const r = await fetch('assets/sounds/' + f); if (!r.ok) throw 0;
      this.buf[f] = await C.decodeAudioData(await r.arrayBuffer());
    } catch { console.warn('[Áudio] Arquivo ausente: assets/sounds/' + f + ' (usando som sintetizado)'); } }));
    this.noise = C.createBuffer(1, C.sampleRate, C.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  apply() { if (!this.ctx) return; this.master.gain.value = Settings.master; this.amb.gain.value = Settings.amb; this.sfx.gain.value = Settings.sfx; },
  startAmbience() {
    const C = this.ctx;
    if (this.buf['ambience.mp3']) { const s = C.createBufferSource(); s.buffer = this.buf['ambience.mp3']; s.loop = true;
      this.ambBus = C.createGain(); this.ambBus.gain.value = .4; s.connect(this.ambBus).connect(this.amb); s.start(); }
    else { this.ambBus = C.createGain(); this.ambBus.gain.value = .3; this.ambBus.connect(this.amb);
      const n = C.createBufferSource(); n.buffer = this.noise; n.loop = true; const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
      const g = C.createGain(); g.gain.value = .3; n.connect(f).connect(g).connect(this.ambBus); n.start(); }
    this.hum(null, .03); // zumbido global de lâmpadas
  },
  hum(pos, vol) { // zumbido 120Hz (posicional se pos)
    const C = this.ctx, o = C.createOscillator(), o2 = C.createOscillator(), g = C.createGain();
    o.frequency.value = 120; o2.frequency.value = 180; o.type = 'sawtooth'; g.gain.value = vol;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    o.connect(f); o2.connect(f); f.connect(g);
    if (pos) { const p = this.panner(pos); g.connect(p); } else g.connect(this.amb);
    o.start(); o2.start();
  },
  panner(pos) { const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2; p.rolloffFactor = 1.5; p.maxDistance = 60;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; p.connect(this.sfx); return p; },
  listener(cam) { const L = this.ctx.listener, p = cam.position, f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } },
  /** Toca um 'thump' sintetizado (batidas, passos, objetos caindo) */
  thump(pos, vol = .5, freq = 90, dur = .25) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(freq, C.currentTime); o.frequency.exponentialRampToValueAtTime(30, C.currentTime + dur);
    g.gain.setValueAtTime(vol, C.currentTime); g.gain.exponentialRampToValueAtTime(.001, C.currentTime + dur);
    o.connect(g).connect(pos ? this.panner(pos) : this.sfx); o.start(); o.stop(C.currentTime + dur);
  },
  click() { const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noise; const g = C.createGain(); g.gain.setValueAtTime(.3, C.currentTime); g.gain.exponentialRampToValueAtTime(.001, C.currentTime + .05);
    const f = C.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000; s.connect(f).connect(g).connect(this.sfx); s.start(); s.stop(C.currentTime + .06); },
  step(pos, run, last) { // retorna índice usado; usa wav se existir, senão ruído filtrado
    const keys = [1, 2, 3, 4].filter(i => this.buf['footstep' + i + '.wav'] && i !== last);
    const C = this.ctx;
    if (keys.length) { const i = keys[Math.floor(Math.random() * keys.length)], s = C.createBufferSource(); s.buffer = this.buf['footstep' + i + '.wav'];
      s.playbackRate.value = rnd(.92, 1.08); const g = C.createGain(); g.gain.value = run ? .9 : .6; s.connect(g).connect(pos ? this.panner(pos) : this.sfx); s.start(); return i; }
    this.thump(pos, run ? .35 : .2, rnd(110, 160), .09); return 0;
  }
};

/* ---------- Input (teclado/mouse + touch) ---------- */
const Input = {
  keys: {}, mx: 0, my: 0, jx: 0, jy: 0, run: false, onFlash: null,
  bind(canvas) {
    addEventListener('keydown', e => { this.keys[e.code] = 1; if (e.code === 'KeyF') this.onFlash?.(); });
    addEventListener('keyup', e => this.keys[e.code] = 0);
    addEventListener('mousemove', e => { if (document.pointerLockElement) { this.mx += e.movementX; this.my += e.movementY; } });
    canvas.addEventListener('click', () => { if (!isTouch && Game.playing) canvas.requestPointerLock?.(); });
    if (isTouch) this.bindTouch();
  },
  bindTouch() { // joystick virtual (esq.), área de olhar (dir.), botões
    const joy = $('joy'), knob = $('knob'); let jid = null, lid = null, lx, ly;
    joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); mv(e); });
    const mv = e => { const r = joy.getBoundingClientRect(); let x = (e.clientX - r.left - 60) / 50, y = (e.clientY - r.top - 60) / 50, l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      this.jx = x; this.jy = y; knob.style.transform = `translate(${x * 40}px,${y * 40}px)`; };
    joy.addEventListener('pointermove', e => e.pointerId === jid && mv(e));
    const end = e => { if (e.pointerId === jid) { jid = null; this.jx = this.jy = 0; knob.style.transform = ''; } };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    const look = $('look');
    look.addEventListener('pointerdown', e => { lid = e.pointerId; look.setPointerCapture(lid); lx = e.clientX; ly = e.clientY; });
    look.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; this.mx += (e.clientX - lx) * 1.6; this.my += (e.clientY - ly) * 1.6; lx = e.clientX; ly = e.clientY; });
    look.addEventListener('pointerup', () => lid = null);
    $('bRun').onpointerdown = () => { this.run = !this.run; $('bRun').style.background = this.run ? '#d8d28a44' : ''; };
    $('bFl').onpointerdown = () => this.onFlash?.();
  }
};

/* ---------- CollisionSystem: raycasts contra as malhas do GLB ---------- */
const Collision = {
  meshes: [], ray: new THREE.Raycaster(), R: .4,
  setup(root) { root.traverse(o => o.isMesh && this.meshes.push(o)); },
  cast(o, d, far, first = true) { this.ray.set(o, d); this.ray.far = far; this.ray.firstHitOnly = first; return this.ray.intersectObjects(this.meshes, false); },
  blocked(p, dir, dist) { // testa 3 alturas (pés, cintura, peito)
    for (const h of [-1.2, -.7, -.2]) { const o = p.clone(); o.y += h; const hit = this.cast(o, dir, this.R + dist); if (hit.length) return true; }
    return false;
  },
  floor(p) { const h = this.cast(p, new THREE.Vector3(0, -1, 0), 3); return h.length ? h[0].point.y : null; },
  /** varre o mapa e retorna pontos de piso válidos (com teto acima e folga lateral) */
  scan(box, n) {
    const out = [], dirs = []; for (let i = 0; i < 8; i++) dirs.push(new THREE.Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)));
    for (let k = 0; k < n; k++) {
      const x = rnd(box.min.x, box.max.x), z = rnd(box.min.z, box.max.z);
      const hits = this.cast(new THREE.Vector3(x, box.max.y + 2, z), new THREE.Vector3(0, -1, 0), box.max.y - box.min.y + 4, false);
      for (let i = 1; i < hits.length; i++) {
        const h = hits[i], ny = h.face.normal.clone().transformDirection(h.object.matrixWorld).y, gap = hits[i - 1].point.y - h.point.y;
        if (ny > .7 && gap > 2 && gap < 8) {
          const p = h.point.clone(); let clear = 3; const e = p.clone(); e.y += 1;
          for (const d of dirs) { const r = this.cast(e, d, 3); if (r.length) clear = Math.min(clear, r[0].distance); }
          out.push({ p, clear, ceil: hits[i - 1].point.y }); break;
        }
      }
    }
    return out;
  }
};

/* ---------- Game ---------- */
const Game = {
  playing: false, t: 0, flash: null, flashOn: false, lights: [], yaw: 0, pitch: 0, eye: 1.65, stepT: 0, lastStep: 0, bobT: 0,
  init() {
    const canvas = $('c'); this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0b0a05); this.scene.fog = new THREE.Fog(0x0b0a05, 2, 40);
    this.cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 100); this.scene.add(this.cam);
    this.scene.add(new THREE.HemisphereLight(0xfff2b0, 0x221a05, .25));
    this.flash = new THREE.SpotLight(0xfff4d6, 0, 22, .45, .5, 1.6); this.flash.target.position.z = -1; this.cam.add(this.flash, this.flash.target);
    this.applyQuality(); addEventListener('resize', () => this.resize());
    Input.bind(canvas); Input.onFlash = () => this.toggleFlash();
  },
  applyQuality() { const q = Settings.quality, m = { low: [1, 18], mid: [1.5, 28], high: [Math.min(devicePixelRatio, 2), 45] }[q];
    this.renderer.setPixelRatio(Math.min(m[0], devicePixelRatio)); this.scene.fog.far = m[1]; this.cam.far = m[1] + 15; this.cam.updateProjectionMatrix();
    this.maxLights = { low: 5, mid: 8, high: 12 }[q]; this.resize(); },
  resize() { this.renderer.setSize(innerWidth, innerHeight, false); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); },
  load() {
    return new Promise((res, rej) => new GLTFLoader().load('assets/backrooms.glb', g => res(g), x => { if (x.total) $('prog').style.width = (x.loaded / x.total * 85) + '%'; },
      e => { console.error('[Cenário] Falha ao carregar assets/backrooms.glb — verifique se o arquivo existe e se você está usando um servidor local.', e); rej(e); }));
  },
  setupWorld(gltf) {
    const root = gltf.scene; this.scene.add(root); root.updateMatrixWorld(true); Collision.setup(root);
    const box = new THREE.Box3().setFromObject(root); this.box = box;
    const pts = Collision.scan(box, 500).sort((a, b) => b.clear - a.clear);
    if (!pts.length) throw new Error('Nenhum piso válido encontrado no GLB');
    const c = box.getCenter(new THREE.Vector3()), good = pts.filter(p => p.clear >= 1.8);
    const start = (good.length ? good : pts).sort((a, b) => a.p.distanceTo(c) - b.p.distanceTo(c))[0];
    this.pos = start.p.clone(); this.pos.y += this.eye;
    this.cam.position.copy(this.pos); this.yaw = rnd(0, Math.PI * 2);
    // saída: ponto válido mais distante do início
    const ex = (good.length ? good : pts).sort((a, b) => b.p.distanceTo(start.p) - a.p.distanceTo(start.p))[0];
    this.exitPos = ex.p.clone().add(new THREE.Vector3(0, 1, 0));
    this.exitMesh = new THREE.Mesh(new THREE.SphereGeometry(.25, 12, 12), new THREE.MeshBasicMaterial({ color: 0x9dffb0 }));
    this.exitMesh.position.copy(this.exitPos); this.scene.add(this.exitMesh);
    const el = new THREE.PointLight(0x8dffa8, 2, 10); el.position.copy(this.exitPos); this.scene.add(el);
    // luzes fluorescentes no teto, espalhadas
    const spots = pts.filter(p => p.ceil).sort(() => Math.random() - .5), chosen = [];
    for (const s of spots) { if (chosen.length >= this.maxLights) break; if (chosen.every(o => o.p.distanceTo(s.p) > 7)) chosen.push(s); }
    for (const s of chosen) { const l = new THREE.PointLight(0xfff0b0, 1.6, 14, 1.8); l.position.set(s.p.x, s.ceil - .3, s.p.z); this.scene.add(l);
      this.lights.push({ l, base: rnd(1.1, 1.8), on: true, flick: 0, ph: rnd(0, 9) }); }
    this.lights.forEach(o => Audio_.hum(o.l.position, .05));
    this.far = pts.filter(p => p.p.distanceTo(start.p) > 15);
  },
  toggleFlash() { if (!this.playing) return; this.flashOn = !this.flashOn; Audio_.click(); $('fl').classList.toggle('on', this.flashOn); },
  start() {
    ['menu', 'load'].forEach(i => $(i).classList.add('hide')); $('hud').classList.remove('hide'); if (isTouch) $('touch').classList.remove('hide');
    this.playing = true; Audio_.ctx.resume(); Audio_.startAmbience(); if (!isTouch) $('c').requestPointerLock?.();
    this.last = performance.now(); requestAnimationFrame(t => this.loop(t));
  },
  loop(now) {
    if (!this.playing) return; const dt = Math.min((now - this.last) / 1000, .05); this.last = now; this.t += dt;
    Player.update(dt); Lighting.update(dt); Events.update(dt); Audio_.listener(this.cam);
    this.flash.intensity = this.flashOn ? 14 : 0;
    this.exitMesh.scale.setScalar(1 + Math.sin(this.t * 3) * .15);
    if (this.cam.position.distanceTo(this.exitPos) < 1.8) this.finish();
    this.renderer.render(this.scene, this.cam); requestAnimationFrame(t => this.loop(t));
  },
  finish() { this.playing = false; document.exitPointerLock?.(); $('hud').classList.add('hide'); $('touch').classList.add('hide'); $('end').classList.remove('hide');
    const T = $('endTxt'); T.textContent = 'Você encontrou uma saída...';
    setTimeout(() => T.textContent = 'Mas será que realmente saiu?', 4000);
    setTimeout(() => { T.textContent = 'CONTINUA...'; $('bAgain').classList.remove('hide'); }, 8000); }
};

/* ---------- Player + FootstepSystem ---------- */
const Player = {
  update(dt) {
    const G = Game, I = Input, k = I.keys, s = Settings.sens * .0022;
    G.yaw -= I.mx * s; G.pitch = Math.max(-1.4, Math.min(1.4, G.pitch - I.my * s)); I.mx = I.my = 0;
    G.cam.rotation.set(G.pitch, G.yaw, 0, 'YXZ');
    let f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) - I.jy, r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + I.jx;
    const l = Math.hypot(f, r); if (l > 1) { f /= l; r /= l; }
    const run = (k.ShiftLeft || k.ShiftRight || I.run) && f > 0, sp = (run ? 4.2 : 2.2) * dt, moving = l > .1;
    const fw = new THREE.Vector3(-Math.sin(G.yaw), 0, -Math.cos(G.yaw)), rt = new THREE.Vector3(Math.cos(G.yaw), 0, -Math.sin(G.yaw));
    const d = fw.multiplyScalar(f * sp).add(rt.multiplyScalar(r * sp));
    for (const ax of ['x', 'z']) { // colisão por eixo (permite deslizar nas paredes)
      if (!d[ax]) continue; const dir = new THREE.Vector3(); dir[ax] = Math.sign(d[ax]);
      if (!Collision.blocked(G.pos, dir, Math.abs(d[ax]))) G.pos[ax] += d[ax];
    }
    const fy = Collision.floor(G.pos); if (fy !== null) G.pos.y += (fy + G.eye - G.pos.y) * Math.min(1, dt * 12);
    G.bobT += moving ? dt * (run ? 11 : 7) : 0;
    G.cam.position.copy(G.pos); G.cam.position.y += moving ? Math.sin(G.bobT) * .035 : 0;
    // passos: intervalo depende de andar/correr; nada quando parado
    if (moving) { G.stepT -= dt; if (G.stepT <= 0) { G.stepT = run ? .32 : .55; G.lastStep = Audio_.step(null, run, G.lastStep); } } else G.stepT = 0;
  }
};

/* ---------- LightingSystem: variações sutis e flickers ocasionais ---------- */
const Lighting = {
  update(dt) { for (const o of Game.lights) {
    let v = o.base * (1 + Math.sin(Game.t * 2 + o.ph) * .04);
    if (o.flick > 0) { o.flick -= dt; v *= Math.random() > .5 ? .15 : 1; }
    else if (Math.random() < dt * .01) o.flick = rnd(.2, 1.2);
    o.l.intensity = o.on ? v : 0; } }
};

/* ---------- HorrorEventSystem: eventos sutis, um por vez, com cooldown ---------- */
const Events = {
  cd: 25, lastId: -1,
  behind(dist) { const f = new THREE.Vector3(Math.sin(Game.yaw), 0, Math.cos(Game.yaw)); return Game.cam.position.clone().addScaledVector(f, dist); },
  list: [
    () => { const f = new THREE.Vector3(Math.sin(Game.yaw), 0, Math.cos(Game.yaw)), b = Game.lights.filter(o => o.on && o.l.position.clone().sub(Game.cam.position).normalize().dot(f) > .3);
      if (!b.length) return false; const o = b[0]; o.on = false; Audio_.thump(o.l.position, .15, 300, .06); return true; },           // luz atrás apaga
    () => { const o = Game.lights[Math.floor(Math.random() * Game.lights.length)]; if (!o) return false; o.flick = rnd(3, 6); return true; },           // luz pisca
    () => { const o = Game.lights.find(o => !o.on); if (!o) return false; o.on = true; return true; },                                                 // luz acende sozinha
    () => { Audio_.thump(Events.behind(rnd(3, 6)), .6, 70, .4); return true; },                                                                       // som atrás
    () => { const p = Game.far?.[Math.floor(Math.random() * Game.far.length)]; if (!p) return false; let n = 0;                                      // passos distantes
      const iv = setInterval(() => { Audio_.step(p.p.clone().setY(p.p.y + 1), false, 0); if (++n > 7) clearInterval(iv); }, 600); return true; },
    () => { const b = Audio_.ambBus; if (!b) return false; const v = b.gain.value; b.gain.setTargetAtTime(0, Audio_.ctx.currentTime, .3);        // silêncio
      setTimeout(() => b.gain.setTargetAtTime(v, Audio_.ctx.currentTime, 1), rnd(4000, 7000)); return true; },
    () => { const p = Game.far?.[Math.floor(Math.random() * Game.far.length)]; if (!p) return false; Audio_.thump(p.p, .8, 120, .5); return true; },   // batida distante
  ],
  update(dt) { this.cd -= dt; if (this.cd > 0) return;
    let id; do id = Math.floor(Math.random() * this.list.length); while (id === this.lastId);
    if (this.list[id]()) { this.lastId = id; this.cd = rnd(20, 45); } else this.cd = 3; }
};

/* ---------- UI / Fluxo ---------- */
Settings.bind(); Game.init();
$('bCfg').onclick = () => { $('menu').classList.add('hide'); $('cfg').classList.remove('hide'); };
$('bBack').onclick = () => { $('cfg').classList.add('hide'); $('menu').classList.remove('hide'); };
$('bAgain').onclick = () => location.reload();
$('bEnter').onclick = () => Game.start();
$('bPlay').onclick = async () => {
  $('menu').classList.add('hide'); $('load').classList.remove('hide');
  try {
    await Audio_.init(); $('prog').style.width = '10%';
    const g = await Game.load(); Game.setupWorld(g); $('prog').style.width = '100%'; $('bEnter').classList.remove('hide');
  } catch (e) { $('load').classList.add('hide'); $('menu').classList.remove('hide'); $('err').textContent = 'Não foi possível carregar o cenário 3D.'; console.error(e); }
};
