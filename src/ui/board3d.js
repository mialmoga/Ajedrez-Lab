/**
 * Tablero 3D (Three.js). Mismo contrato de vista que board2d.js.
 * Las piezas son geometría procedural (sin modelos externos): revoluciones (Lathe) + extrusión
 * para el caballo. Para usar modelos .glb propios, reemplaza `buildPiece()`.
 */
import * as THREE from 'three';
import { FONT_SANS } from './fonts.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';

const FILES = 'abcdefgh';
const sqPos = (sq) => new THREE.Vector3(FILES.indexOf(sq[0]) - 3.5, 0, 3.5 - (Number(sq[1]) - 1));

// Perfiles de revolución [radio, altura]
const PROFILE = {
  p: [[0, 0], [.3, 0], [.3, .06], [.22, .13], [.13, .34], [.2, .38], [.11, .43], [.09, .5]],
  r: [[0, 0], [.33, 0], [.33, .07], [.25, .15], [.2, .55], [.29, .6], [.29, .78], [0, .78]],
  b: [[0, 0], [.32, 0], [.32, .06], [.22, .14], [.12, .4], [.21, .46], [.1, .5], [.13, .62], [.17, .72], [.15, .82], [.08, .92], [0, .95]],
  q: [[0, 0], [.35, 0], [.35, .07], [.25, .16], [.13, .5], [.21, .58], [.12, .64], [.15, .82], [.27, 1.0], [.2, 1.04], [0, 1.04]],
  k: [[0, 0], [.35, 0], [.35, .07], [.25, .16], [.14, .5], [.22, .58], [.13, .64], [.16, .82], [.25, 1.0], [.2, 1.06], [0, 1.06]],
  n: [[0, 0], [.31, 0], [.31, .06], [.24, .14], [.2, .2], [0, .2]],
};
const HORSE = [[-.2, 0], [.2, 0], [.18, .28], [.3, .46], [.36, .55], [.34, .64], [.26, .66], [.14, .8], [.1, .92], [.02, .86], [-.1, .76], [-.2, .42]];

function lathe(type) {
  return new THREE.LatheGeometry(PROFILE[type].map(([x, y]) => new THREE.Vector2(x, y)), 32);
}

export function createBoard3D(container, { theme }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    const msg = document.createElement('div');
    msg.className = 'board3d-fallback';
    msg.textContent = 'WebGL no está disponible en este navegador. Usa la vista 2D.';
    container.append(msg);
    return { onSquareClick: null, setState() {}, setTheme() {}, destroy() { msg.remove(); } };
  }

  const root = document.createElement('div');
  root.className = 'board3d';
  container.append(root);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 24;
  controls.maxPolarAngle = Math.PI * 0.47;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(5, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 32 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // --- materiales compartidos (los colores se actualizan al cambiar de tema) ---
  const mat = {
    light: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    frame: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
    w: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 }),
    b: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 }),
  };
  const overlay = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const hl = {
    last: overlay(0xf6e05e, 0.35),
    selected: overlay(0xf6e05e, 0.6),
    check: overlay(0xff2d2d, 0.6),
    target: overlay(0x28a05a, 0.75),
    capture: overlay(0xdc3232, 0.85),
  };
  const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const markMat = { riesgo: overlay(0xe03a3a, 0.9), vulnerable: overlay(0x2fb36a, 0.9), clavada: overlay(0xf0a400, 0.9) };
  const arrowMat = { mejor: overlay(0x1f9d55, 0.9), respuesta: overlay(0x3b82c4, 0.6) };
  const arrowHeadGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, 0, 0.42], 3)); g.setIndex([0, 2, 1]); return g; })(); // triángulo plano con la punta hacia +z
  const dotGeo = new THREE.CircleGeometry(0.17, 24).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(0.36, 0.45, 32).rotateX(-Math.PI / 2);

  // --- tablero ---
  const squares = [];
  const squareGeo = new THREE.BoxGeometry(1, 0.2, 1);
  for (let f = 0; f < 8; f++) {
    for (let r = 1; r <= 8; r++) {
      const m = new THREE.Mesh(squareGeo, (f + r) % 2 === 1 ? mat.light : mat.dark); // a1 oscura
      m.position.set(f - 3.5, -0.1, 3.5 - (r - 1));
      m.receiveShadow = true;
      m.userData.sq = FILES[f] + r;
      scene.add(m);
      squares.push(m);
    }
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.3, 9.6), mat.frame);
  base.position.y = -0.35;
  base.receiveShadow = true;
  scene.add(base);
  for (const [w, d, x, z] of [[9.4, 0.5, 0, 4.2], [9.4, 0.5, 0, -4.2], [0.5, 8, 4.2, 0], [0.5, 8, -4.2, 0]]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, d), mat.frame);
    rim.position.set(x, -0.08, z);
    rim.receiveShadow = true;
    scene.add(rim);
  }
  // etiquetas a-h y 1-8 sobre el borde
  const labelTex = (ch) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#e8d9b8';
    g.font = `bold 44px ${FONT_SANS}, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, 32, 34);
    return new THREE.CanvasTexture(c);
  };
  const labelGeo = new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    for (const z of [4.2, -4.2]) {
      const l = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTex(FILES[i]), transparent: true }));
      l.position.set(i - 3.5, 0.05, z);
      scene.add(l);
    }
    for (const x of [4.2, -4.2]) {
      const l = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTex(String(i + 1)), transparent: true }));
      l.position.set(x, 0.05, 3.5 - i);
      scene.add(l);
    }
  }

  // --- piezas ---
  const geoCache = {};
  const geo = (t) => (geoCache[t] ??= lathe(t));
  let horseGeo = null;
  const getHorse = () => {
    if (horseGeo) return horseGeo;
    const shape = new THREE.Shape();
    HORSE.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    horseGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 });
    horseGeo.translate(0, 0, -0.11);
    return horseGeo;
  };

  function buildPiece(type, color) {
    const g = new THREE.Group();
    const m = color === 'w' ? mat.w : mat.b;
    const add = (geometry, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geometry, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    add(geo(type));
    if (type === 'p') add(new THREE.SphereGeometry(0.17, 20, 16), 0, 0.6);
    if (type === 'r') for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const b = add(new THREE.BoxGeometry(0.13, 0.14, 0.13), Math.cos(a) * 0.2, 0.85, Math.sin(a) * 0.2);
      b.rotation.y = -a;
    }
    if (type === 'b') add(new THREE.SphereGeometry(0.055, 12, 10), 0, 1.0);
    if (type === 'q') {
      add(new THREE.TorusGeometry(0.2, 0.04, 10, 24).rotateX(Math.PI / 2), 0, 1.02);
      add(new THREE.SphereGeometry(0.09, 14, 12), 0, 1.13);
    }
    if (type === 'k') {
      add(new THREE.BoxGeometry(0.09, 0.32, 0.09), 0, 1.22);
      add(new THREE.BoxGeometry(0.26, 0.08, 0.09), 0, 1.26);
    }
    if (type === 'n') {
      const horse = add(getHorse(), 0, 0.17);
      horse.scale.setScalar(0.88);
      horse.rotation.y = color === 'w' ? Math.PI / 2 : -Math.PI / 2; // blancas miran hacia -z
    }
    g.userData = { type, color, sq: null };
    return g;
  }

  const pieces = new Map(); // casilla -> grupo
  let tweens = [];

  function addPiece(sq, p) {
    const g = buildPiece(p.type, p.color);
    g.userData.sq = sq;
    g.position.copy(sqPos(sq));
    scene.add(g);
    pieces.set(sq, g);
  }
  function removePiece(sq) {
    const g = pieces.get(sq);
    if (!g) return;
    tweens = tweens.filter((t) => t.obj !== g);
    scene.remove(g);
    pieces.delete(sq);
  }
  function startTween(obj, from, to, hop) {
    tweens = tweens.filter((t) => t.obj !== obj);
    obj.position.copy(from);
    tweens.push({ obj, from, to, t: 0, dur: from.distanceTo(to) > 1.5 ? 0.45 : 0.32, hop: hop ? 0.9 : 0.35 });
  }
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  // --- efectos de cine: estallido de piezas comidas y bloom (opcionales) ---
  const fx = { estallidos: false, bloom: false, calidad: 'media' };
  const FX_CANT = { baja: { chispas: 24, trozos: 6 }, media: { chispas: 70, trozos: 12 }, alta: { chispas: 150, trozos: 26 } };
  let lastKey = '';
  const dying = []; // piezas comidas que aún esperan su estallido
  let bursts = []; // estallidos en vuelo
  let shake = 0;
  const shardGeo = new THREE.TetrahedronGeometry(0.075);
  const flashGeo = new THREE.RingGeometry(0.12, 0.2, 40);
  const sparkTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();

  function spawnBurst(sq, color) {
    const n = FX_CANT[fx.calidad] ?? FX_CANT.media;
    const origin = sqPos(sq);
    origin.y = 0.4;
    const spark = color === 'w' ? 0xfff0c8 : 0xff9a55;
    const group = new THREE.Group();
    group.position.copy(origin);
    // chispas (puntos aditivos; con bloom brillan)
    const pos = new Float32Array(n.chispas * 3), vel = [];
    for (let i = 0; i < n.chispas; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 2.6;
      vel.push(new THREE.Vector3(Math.cos(a) * sp, 1.2 + Math.random() * 3.4, Math.sin(a) * sp));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: spark, size: 0.2, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    pm.color.multiplyScalar(fx.bloom ? 3 : 1.4);
    const points = new THREE.Points(geo, pm);
    points.frustumCulled = false;
    group.add(points);
    // trozos de la pieza (del color de la pieza) que giran y caen
    const shardMat = new THREE.MeshStandardMaterial({ color: color === 'w' ? 0xeee4d0 : 0x2b2724, roughness: 0.5, metalness: 0.1, emissive: spark, emissiveIntensity: 0.25, transparent: true });
    const shards = [];
    for (let i = 0; i < n.trozos; i++) {
      const m = new THREE.Mesh(shardGeo, shardMat);
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.9;
      m.scale.setScalar(0.6 + Math.random() * 1.1);
      m.castShadow = true;
      shards.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 1 + Math.random() * 2.4, Math.sin(a) * sp), w: new THREE.Vector3(Math.random() * 9 - 4.5, Math.random() * 9 - 4.5, Math.random() * 9 - 4.5) });
      group.add(m);
    }
    // destello en el suelo
    const fm = new THREE.MeshBasicMaterial({ color: spark, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    fm.color.multiplyScalar(fx.bloom ? 1.6 : 1);
    const flash = new THREE.Mesh(flashGeo, fm);
    flash.rotation.x = -Math.PI / 2;
    flash.position.y = -0.37;
    group.add(flash);
    scene.add(group);
    bursts.push({ group, pos, vel, points, pm, shards, shardMat, flash, fm, geo, t: 0, life: 1.25 });
    shake = Math.min(1, shake + 0.8);
  }

  function updateBursts(dt) {
    for (const d of dying) {
      d.t += dt;
      if (d.t >= d.delay) {
        const sq = d.g.userData.sq;
        scene.remove(d.g);
        spawnBurst(sq, d.g.userData.color);
        d.done = true;
      }
    }
    if (dying.some((d) => d.done)) for (let i = dying.length - 1; i >= 0; i--) if (dying[i].done) dying.splice(i, 1);
    for (const b of bursts) {
      b.t += dt;
      const k = b.t / b.life;
      for (let i = 0; i < b.vel.length; i++) {
        const v = b.vel[i];
        v.y -= 7 * dt;
        v.multiplyScalar(1 - 0.9 * dt);
        b.pos[i * 3] += v.x * dt; b.pos[i * 3 + 1] += v.y * dt; b.pos[i * 3 + 2] += v.z * dt;
      }
      b.geo.attributes.position.needsUpdate = true;
      b.pm.opacity = Math.max(0, 1 - k * k);
      for (const s of b.shards) {
        s.v.y -= 9 * dt;
        s.m.position.addScaledVector(s.v, dt);
        s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
        if (s.m.position.y < -0.33 && s.v.y < 0) { s.m.position.y = -0.33; s.v.y *= -0.35; s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.5); }
      }
      b.shardMat.opacity = Math.min(1, Math.max(0, (1 - k) * 2.5));
      const fk = Math.min(1, b.t / 0.45);
      b.flash.scale.setScalar(1 + fk * 7);
      b.fm.opacity = 0.9 * (1 - fk);
    }
    const vivos = [];
    for (const b of bursts) {
      if (b.t < b.life) vivos.push(b); else disposeBurst(b);
    }
    bursts = vivos;
    shake = Math.max(0, shake - dt * 3.2);
  }
  function disposeBurst(b) {
    scene.remove(b.group);
    b.geo.dispose(); b.pm.dispose(); b.shardMat.dispose(); b.fm.dispose();
  }
  /** Quita ya las piezas pendientes de estallar y los estallidos en vuelo (saltos, deshacer, salir del cine). */
  function flushDying() {
    for (const d of dying) scene.remove(d.g);
    dying.length = 0;
    for (const b of bursts) disposeBurst(b);
    bursts = [];
    shake = 0;
  }

  // --- bloom (se carga solo cuando se pide) ---
  let composer = null, bloomPass = null, composerLoading = null;
  async function ensureComposer() {
    if (composer || composerLoading) return composerLoading;
    composerLoading = (async () => {
      try {
        const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
          import('../../vendor/three/postprocessing/EffectComposer.js'),
          import('../../vendor/three/postprocessing/RenderPass.js'),
          import('../../vendor/three/postprocessing/UnrealBloomPass.js'),
          import('../../vendor/three/postprocessing/OutputPass.js'),
        ]);
        const c = new EffectComposer(renderer);
        c.addPass(new RenderPass(scene, camera));
        bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.92);
        c.addPass(bloomPass);
        c.addPass(new OutputPass());
        composer = c;
        resizeNow();
      } catch (e) {
        console.warn('Bloom no disponible:', e);
        fx.bloom = false;
      } finally { composerLoading = null; }
    })();
    return composerLoading;
  }
  function setEfectos(o = {}) {
    if ('estallidos' in o) { fx.estallidos = !!o.estallidos; if (!fx.estallidos) flushDying(); }
    if (o.calidad) fx.calidad = o.calidad;
    if ('bloom' in o) { fx.bloom = !!o.bloom; if (fx.bloom) ensureComposer(); }
  }

  function syncPieces(board, move) {
    const want = new Map();
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const p = board[row][col];
      if (p) want.set(FILES[col] + (8 - row), p);
    }
    // un re-dibujado sin jugada (mismas piezas) no debe cortar un estallido en curso; un salto sí
    const key = [...want].map(([sq, p]) => sq + p.color + p.type).sort().join();
    if (move || key !== lastKey) flushDying();
    lastKey = key;
    if (move) {
      const mover = pieces.get(move.from);
      if (mover) {
        if (move.captured) {
          const capSq = move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
          if (fx.estallidos && pieces.get(capSq)) {
            // la pieza comida se queda hasta que llega la que la captura; entonces estalla
            const g = pieces.get(capSq);
            pieces.delete(capSq);
            tweens = tweens.filter((t) => t.obj !== g);
            dying.push({ g, t: 0, delay: (sqPos(move.from).distanceTo(sqPos(move.to)) > 1.5 ? 0.45 : 0.32) * 0.85 });
          } else removePiece(capSq);
        }
        pieces.delete(move.from);
        pieces.set(move.to, mover);
        mover.userData.sq = move.to;
        startTween(mover, sqPos(move.from), sqPos(move.to), move.piece === 'n');
        if (move.flags.includes('k') || move.flags.includes('q')) {
          const rank = move.from[1];
          const [rf, rt] = move.flags.includes('k') ? ['h', 'f'] : ['a', 'd'];
          const rook = pieces.get(rf + rank);
          if (rook) {
            pieces.delete(rf + rank);
            pieces.set(rt + rank, rook);
            rook.userData.sq = rt + rank;
            startTween(rook, sqPos(rf + rank), sqPos(rt + rank), false);
          }
        }
      }
    }
    for (const [sq, g] of [...pieces]) {
      const w = want.get(sq);
      if (!w || w.type !== g.userData.type || w.color !== g.userData.color) removePiece(sq);
    }
    for (const [sq, p] of want) if (!pieces.has(sq)) addPiece(sq, p);
  }

  // --- resaltados ---
  const hlGroup = new THREE.Group();
  scene.add(hlGroup);
  function drawHighlights(s) {
    hlGroup.clear();
    const put = (geometry, material, sq, y, scale = 1) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.copy(sqPos(sq));
      m.position.y = y;
      m.scale.setScalar(scale);
      hlGroup.add(m);
    };
    if (s.lastMove) { put(planeGeo, hl.last, s.lastMove.from, 0.012); put(planeGeo, hl.last, s.lastMove.to, 0.012); }
    if (s.selected) put(planeGeo, hl.selected, s.selected, 0.014);
    if (s.checkSquare) put(planeGeo, hl.check, s.checkSquare, 0.016);
    for (const m of s.marks ?? []) put(ringGeo, markMat[m.tipo], m.sq, m.tipo === 'clavada' ? 0.024 : 0.022, m.tipo === 'clavada' ? 0.8 : 1.05);
    for (const a of s.arrows ?? []) { // flecha plana sobre el tablero: cuerpo + punta triangular
      const A = sqPos(a.from), B = sqPos(a.to), d = B.clone().sub(A), L = d.length(), u = d.clone().normalize();
      const mat = a.tipo === 'mejor' ? arrowMat.mejor : arrowMat.respuesta, w = a.tipo === 'mejor' ? 0.16 : 0.11, head = 0.42;
      const ang = Math.atan2(d.x, d.z), cuerpo = Math.max(0.05, L - head - 0.2);
      const shaft = new THREE.Mesh(planeGeo, mat);
      shaft.scale.set(w, 1, cuerpo);
      shaft.position.copy(A.clone().addScaledVector(u, 0.2 + cuerpo / 2)); shaft.position.y = 0.03; shaft.rotation.y = ang;
      const tip = new THREE.Mesh(arrowHeadGeo, mat);
      tip.scale.set(a.tipo === 'mejor' ? 1 : 0.8, 1, 1);
      tip.position.copy(B.clone().addScaledVector(u, -head - 0.02)); tip.position.y = 0.03; tip.rotation.y = ang;
      hlGroup.add(shaft, tip);
    }
    for (const t of s.targets) t.capture ? put(ringGeo, hl.capture, t.sq, 0.02) : put(dotGeo, hl.target, t.sq, 0.02);
  }

  // --- cámara, tema, tamaño ---
  let currentOrientation = null;
  function setOrientation(o) {
    if (o === currentOrientation) return;
    currentOrientation = o;
    camera.position.set(0, 9.6, o === 'w' ? 9.2 : -9.2);
    controls.target.set(0, 0, 0.3 * (o === 'w' ? 1 : -1));
    controls.update();
  }
  function applyTheme(t) {
    const c = t.b3d;
    mat.light.color.set(c.light);
    mat.dark.color.set(c.dark);
    mat.frame.color.set(c.frame);
    mat.w.color.set(c.white);
    mat.b.color.set(c.black);
    scene.background = new THREE.Color(c.bg);
  }
  applyTheme(theme);

  function resizeNow() {
    const w = root.clientWidth, hgt = root.clientHeight;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, hgt); }
  }
  const ro = new ResizeObserver(resizeNow);
  ro.observe(root);

  // --- calidad (modo cine): resolución y sombras ---
  const CALIDAD = { baja: { dpr: 1, sombra: 0 }, media: { dpr: 1.5, sombra: 1024 }, alta: { dpr: 2, sombra: 2048 } };
  function setQuality(q) {
    const c = CALIDAD[q] ?? CALIDAD.alta;
    fx.calidad = CALIDAD[q] ? q : 'alta';
    renderer.setPixelRatio(Math.min(devicePixelRatio, c.dpr));
    sun.castShadow = c.sombra > 0;
    if (c.sombra > 0 && sun.shadow.mapSize.x !== c.sombra) { sun.shadow.map?.dispose(); sun.shadow.map = null; sun.shadow.mapSize.set(c.sombra, c.sombra); }
    resizeNow();
  }

  // --- cámara de cine: balanceo lento alrededor del tablero (sin control manual) ---
  let cine = null; // { base: Vector3, target: Vector3, t }
  function setCine(on) {
    if (on && !cine) {
      cine = { base: camera.position.clone(), target: controls.target.clone(), t: 0 };
      controls.enabled = false;
    } else if (!on && cine) {
      camera.position.copy(cine.base);
      controls.target.copy(cine.target);
      controls.enabled = true;
      cine = null;
      setEfectos({ estallidos: false, bloom: false });
      controls.update();
    }
  }

  // --- clic (distingue clic de arrastre para no chocar con la órbita de cámara) ---
  const ray = new THREE.Raycaster();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
    down = null;
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    for (const hit of ray.intersectObjects([...squares, ...pieces.values()], true)) {
      let o = hit.object;
      while (o && !o.userData.sq) o = o.parent;
      if (o) { view.onSquareClick?.(o.userData.sq); break; }
    }
  });

  // --- bucle ---
  let raf = 0, last = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const tw of tweens) {
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = ease(tw.t);
      tw.obj.position.lerpVectors(tw.from, tw.to, k);
      tw.obj.position.y = Math.sin(Math.PI * k) * tw.hop;
    }
    tweens = tweens.filter((tw) => tw.t < 1);
    if (dying.length || bursts.length) updateBursts(dt); else shake = 0;
    if (cine) {
      cine.t += dt;
      const a = 0.16 * Math.sin(cine.t * 0.21), b = 1 + 0.025 * Math.sin(cine.t * 0.13 + 1);
      const rel = cine.base.clone().sub(cine.target);
      rel.applyAxisAngle(new THREE.Vector3(0, 1, 0), a).multiplyScalar(b);
      camera.position.copy(cine.target).add(rel);
      if (shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.12 * shake, (Math.random() - 0.5) * 0.08 * shake, (Math.random() - 0.5) * 0.12 * shake));
      camera.lookAt(cine.target);
    } else controls.update();
    if (root.clientWidth) { if (composer && fx.bloom) composer.render(dt); else renderer.render(scene, camera); }
  }
  raf = requestAnimationFrame(loop);

  const view = {
    onSquareClick: null,
    setState(s) {
      setOrientation(s.orientation);
      syncPieces(s.board, s.move);
      drawHighlights(s);
    },
    setTheme(t) { applyTheme(t); },
    setQuality,
    setCine,
    setEfectos,
    destroy() {
      flushDying();
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      root.remove();
    },
  };
  return view;
}
