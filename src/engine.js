import { N, X0, X1, AXIS_Y, R0, CLAMP, DX, BX, clamp, H } from './geom.js';
import { sampleTarget, makeBlank } from './shapes.js';
import { SPECIES } from './species.js';

export const TOOLS = {
  gouge:     { name: 'Gouge',        w: 30, safe: 20, scratch: 10, desc: 'Wide & fast — hollows and general shaping', edge: (u) => Math.max(0, 1 - u * u) },
  skew:      { name: 'Skew Chisel',  w: 14, safe: 12, scratch: 6,  desc: 'Fine, precise cuts for small details',     edge: (u) => Math.max(0, 1 - Math.abs(u)) },
  parting:   { name: 'Parting Tool', w: 7,  safe: 34, scratch: 8,  desc: 'Thin walls, beads and deep grooves',        edge: (u) => (Math.abs(u) < 0.85 ? 1 : 0) },
};

export const GRITS = [
  { id: 80,  label: '80',  floor: 18,  smooth: 1.0 },
  { id: 120, label: '120', floor: 6,   smooth: 0.8 },
  { id: 220, label: '220', floor: 3,   smooth: 0.6 },
  { id: 400, label: '400', floor: 1.5, smooth: 0.4 },
];
const gritById = (g) => GRITS.find((x) => x.id === g) || GRITS[0];

const xToI = (x) => ((x - X0) / (X1 - X0)) * (N - 1);

function makeGrain() {
  const g = [];
  for (let i = 0; i < 46; i++) {
    g.push({
      a: Math.random() * Math.PI * 2,
      c1: Math.random() * 6, c2: Math.random() * 6,
      amp1: 0.05 + Math.random() * 0.14,
      amp2: 0.03 + Math.random() * 0.1,
      dark: Math.random() < 0.55,
      alpha: 0.05 + Math.random() * 0.12,
      w: 0.6 + Math.random() * 1.7,
    });
  }
  return g;
}

export function createState(shapeId, rpm = 1200) {
  const tgt = sampleTarget(shapeId);
  const profile = makeBlank(tgt);
  let initialVol = 0;
  for (let i = 0; i < N; i++) initialVol += Math.PI * profile[i] * profile[i] * DX;
  return {
    profile, tgt, shapeId, initialVol,
    speciesId: 'beech',
    rpm, phase: 0, t: 0,
    tool: { type: 'gouge', x: 380, r: R0 + 18, engaged: false, auto: false, dir: 1, prevX: 380 },
    removedVol: 0,
    status: 'IDLE', match: 0, over: 0,
    done: false, displayed: false, oiled: false,
    cracked: false, warnedThin: false, warnedLow: false, warnedDull: false,
    edge: 1, honing: 0,
    scorches: [],
    finish: { grit: 80, scratch: 20, oiling: 0, sanding: false, autoSand: false, sandPasses: 0, roughness: 40, trendBase: null },
    sandBudget: new Float32Array(N).fill(3),
    grade: null,
    touchPos: null,
    shake: 0, chatter: 0,
    msg: { text: '', until: 0 },
    events: [], particles: [],
    grain: makeGrain(),
    lastScorchToast: 0,
  };
}

function toast(s, text, dur = 3.2) {
  s.msg = { text, until: s.t + dur };
}

function spawn(s, x, y, n, power = 1) {
  for (let k = 0; k < n; k++) {
    const roll = Math.random();
    const kind = roll < 0.7 ? 'shaving' : roll < 0.88 ? 'dust' : 'chip';
    const sp = 40 + Math.random() * 150 * power;
    const life = 0.9 + Math.random() * 1.3;
    s.particles.push({
      kind,
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 6,
      vx: sp * (0.4 + Math.random() * 0.8),
      vy: -30 - Math.random() * 130 * power,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 10,
      size: (kind === 'chip' ? 2.2 : 0.7) + Math.random() * (kind === 'shaving' ? 2.2 : 1.2),
      life, max: life,
    });
  }
  if (s.particles.length > 420) s.particles.splice(0, s.particles.length - 420);
}

function doTear(s, i0, i1) {
  const ic = i0 + Math.floor(Math.random() * Math.max(1, i1 - i0));
  for (let j = Math.max(CLAMP, ic - 5); j <= Math.min(N - 1 - CLAMP, ic + 5); j++) {
    const g = Math.exp(-((j - ic) ** 2) / 9);
    s.profile[j] = Math.max(1.5, s.profile[j] - (4 + Math.random() * 7) * g);
  }
  s.shake = 7;
  s.events.push({ type: 'chip' });
  toast(s, 'Tear-out! Cut depth was too deep for this RPM.');
  spawn(s, BX(ic), AXIS_Y - s.profile[ic], 26, 1.6);
}

// box blur around index i
function smoothAt(p, i, k = 3) {
  let sum = 0, n = 0;
  for (let j = i - k; j <= i + k; j++) {
    if (j < 0 || j >= p.length) continue;
    sum += p[j]; n++;
  }
  return sum / n;
}

function computeRoughness(s) {
  let hf = 0, cnt = 0;
  for (let i = CLAMP; i < N - CLAMP; i++) {
    hf += Math.abs(s.profile[i] - smoothAt(s.profile, i, 3));
    cnt++;
  }
  hf /= cnt;
  const scorch = s.scorches.reduce((a, x) => a + x.i, 0);
  return clamp(hf * 16 + scorch * 5 + s.finish.scratch, 0, 100);
}

export function gradeTurning(s) {
  const m = s.match;
  const oPen = clamp(s.over * 30, 0, 100);
  const crackPen = s.cracked ? 25 : 0;
  const r = s.finish.roughness;
  const t = s.t;
  const time = t < 60 ? 100 : t < 120 ? 78 : t < 240 ? 55 : 35;
  const score = clamp(m * 0.45 + (100 - oPen) * 0.15 + (100 - r) * 0.25 + time * 0.15 - crackPen * 0.3, 0, 100);
  const letter = score >= 92 ? 'S' : score >= 84 ? 'A' : score >= 74 ? 'B' : score >= 60 ? 'C' : 'D';
  return { letter, score: Math.round(score) };
}

export function step(s, dt, keys = new Set()) {
  dt = Math.min(dt, 0.05);
  s.t += dt;
  s.shake *= Math.max(0, 1 - 5 * dt);
  s.phase += (Math.PI * 2 * s.rpm / 60) * dt;

  const spec = SPECIES[s.speciesId];
  const d = spec.density;
  const cutRateFactor = 1.32 - d * 0.42;
  const chatterThresh = 460 + d * 440;
  const safeFactor = 1.25 - d * 0.35;
  const wearFactor = 0.55 + d * 0.9;

  // ---- keyboard movement ----
  const kx = 300 * dt, kr = 240 * dt;
  if (keys.has('ArrowLeft')) s.tool.x -= kx;
  if (keys.has('ArrowRight')) s.tool.x += kx;
  if (keys.has('ArrowUp')) s.tool.r += kr;
  if (keys.has('ArrowDown')) s.tool.r -= kr;
  s.tool.x = clamp(s.tool.x, X0 + 8, X1 - 8);
  s.tool.r = clamp(s.tool.r, 0, 132);

  // ---- honing ----
  if (s.honing > 0) {
    s.honing += dt / 1.4;
    if (s.honing >= 1) {
      s.honing = 0;
      s.edge = 1;
      s.warnedDull = false;
    }
  }

  // ---- auto-turn (demo) ----
  if (s.tool.auto && !s.done) {
    s.tool.x += s.tool.dir * 160 * dt;
    if (s.tool.x > X1 - 14) { s.tool.x = X1 - 14; s.tool.dir = -1; }
    else if (s.tool.x < X0 + 14) { s.tool.x = X0 + 14; s.tool.dir = 1; }
    s.tool.r = s.tgt[Math.round(xToI(s.tool.x))] + 1;
    s.tool.engaged = true;
  }

  // ---- low RPM warning ----
  if (s.tool.engaged && s.rpm >= 40 && s.rpm < chatterThresh - 280 && !s.warnedLow && !s.done && s.honing === 0) {
    s.warnedLow = true;
    toast(s, `Below ~${Math.round(chatterThresh - 280)} RPM ${spec.name.toLowerCase()} starts to chatter — raise the speed.`);
  }
  if (s.rpm >= chatterThresh + 80) s.warnedLow = false;

  // ---- cutting (only before the piece is completed) ----
  let cutting = false, cutVolFrame = 0, maxD = 0;
  const auto = s.tool.auto;
  if (s.tool.engaged && s.rpm >= 40 && !s.done && s.honing === 0) {
    const tool = TOOLS[s.tool.type];
    const half = tool.w / 2;
    const i0 = Math.max(CLAMP, Math.floor(xToI(s.tool.x - half)));
    const i1 = Math.min(N - 1 - CLAMP, Math.ceil(xToI(s.tool.x + half)));
    if (i1 > i0) {
      if (!auto) {
        for (let i = i0; i <= i1; i++) {
          const dd = s.profile[i] - s.tool.r;
          if (dd > maxD) maxD = dd;
        }
      }
      const rate = (10 + s.rpm * 0.022) * dt * cutRateFactor * (auto ? 2.5 : 1);
      const feed = Math.abs(s.tool.x - s.tool.prevX) / Math.max(dt, 1e-4);
      for (let i = i0; i <= i1; i++) {
        // auto mode: machine-follow each sample toward its own local target,
        // so a rigid tool radius can never overcut a steep shoulder
        const e = auto ? 1 : tool.edge((Math.abs(BX(i) - s.tool.x) / half));
        if (e <= 0) continue;
        const refR = auto && s.tgt ? s.tgt[i] + 0.5 : s.tool.r;
        const dd = s.profile[i] - refR;
        if (dd > 0.02) {
          const rem = Math.min(dd, rate * e * (1 + feed / 520));
          if (rem > 0.001) {
            const r0 = s.profile[i];
            s.removedVol += Math.PI * (r0 * r0 - (r0 - rem) * (r0 - rem)) * DX;
            s.profile[i] = r0 - rem;
            cutVolFrame += rem;
            cutting = true;
          }
        }
      }
      if (cutting) {
        spawn(s, s.tool.x, AXIS_Y - s.profile[Math.round(xToI(s.tool.x))], Math.min(16, 2 + cutVolFrame * 0.9), 1);
        if (!auto) {
          // edge wear (the demo pass is a clean machine cut)
          s.edge = Math.max(0, s.edge - cutVolFrame * 0.00016 * wearFactor * (s.edge < 0.45 ? 1.6 : 1));
          if (s.edge < 0.5 && !s.warnedDull) {
            s.warnedDull = true;
            toast(s, 'The edge is getting dull — press H to hone it.');
          }
          // scorch from a dull edge
          if (s.edge < 0.45) {
            const p = (0.45 - s.edge) * 2.2 * dt * 3;
            if (Math.random() < p) {
              s.scorches.push({ t: (s.tool.x - X0) / (X1 - X0), i: 0.5 + Math.random() * 0.5 });
              s.events.push({ type: 'scorch' });
              if (s.t - s.lastScorchToast > 5) {
                s.lastScorchToast = s.t;
                toast(s, 'Burnt! Dull edge is scorching the wood — hone it (H).', 3);
              }
            }
          }
        }
      }
      // tear-out: too deep a cut at too low a speed (manual passes only)
      const safe = tool.safe * safeFactor;
      if (!auto && maxD > safe && s.rpm < 1700) {
        const p = Math.min(0.9, ((maxD - safe) / 24) * (1500 / s.rpm) * dt * 3.2);
        if (Math.random() < p) doTear(s, i0, i1);
      }
      // chatter: low speed + cutting -> scalloped marks
      if (s.rpm < chatterThresh) {
        s.chatter = Math.min(1, s.chatter + dt * 2.6 * (s.edge < 0.45 ? 1.4 : 1));
        for (let i = i0; i <= i1; i++) {
          const wv = Math.max(0, Math.sin(BX(i) * 0.09 + s.t * 46));
          s.profile[i] = Math.max(1, s.profile[i] - wv * s.chatter * 26 * dt);
        }
      }
    }
  }
  s.chatter = Math.max(0, s.chatter - ((cutting && s.rpm < chatterThresh) ? 0 : dt * 2.2));
  s.tool.prevX = s.tool.x;

  // ---- sanding (finishing stage) ----
  let sanding = false;
  if (s.done && s.finish.sanding) {
    // auto-sand drives the tool across the piece
    if (s.finish.autoSand) {
      s.tool.x += s.tool.dir * 220 * dt;
      if (s.tool.x > X1 - 16) { s.tool.x = X1 - 16; s.tool.dir = -1; s.finish.sandPasses++; }
      if (s.tool.x < X0 + 16) { s.tool.x = X0 + 16; s.tool.dir = 1; s.finish.sandPasses++; }
      if (s.finish.sandPasses >= 4) { s.finish.autoSand = false; }
    }
    if (s.tool.engaged) {
      const grit = gritById(s.finish.grit);
      // freeze the shape the player achieved: shallow low-pass of the current
      // profile (small enough to follow tight fillets, blind to chatter ripples)
      if (!s.finish.trendBase) {
        const b = new Float32Array(N);
        for (let i = 0; i < N; i++) b[i] = smoothAt(s.profile, i, 2);
        s.finish.trendBase = b;
      }
      const i0 = Math.max(CLAMP, Math.floor(xToI(s.tool.x - 24)));
      const i1 = Math.min(N - 1 - CLAMP, Math.ceil(xToI(s.tool.x + 24)));
      let sanded = 0;
      for (let i = i0; i <= i1; i++) {
        // relax the surface toward the frozen shape: removes chatter/scallops,
        // never distorts the curve
        const diff = s.finish.trendBase[i] - s.profile[i];
        const take = Math.min(Math.abs(diff) * 0.55 * grit.smooth, s.sandBudget[i]);
        if (take > 0.002) {
          s.profile[i] += diff * (take / Math.abs(diff));
          s.sandBudget[i] -= take;
          sanded += take;
        }
      }
      for (const sc of s.scorches) {
        const scx = X0 + sc.t * (X1 - X0);
        if (Math.abs(scx - s.tool.x) < 30) sc.i = Math.max(0, sc.i - dt * 2.2 * grit.smooth);
      }
      s.scorches = s.scorches.filter((x) => x.i > 0.03);
      if (s.finish.scratch > grit.floor) {
        s.finish.scratch = Math.max(grit.floor, s.finish.scratch - dt * 4);
      }
      if (sanded > 0.05) {
        spawn(s, s.tool.x, AXIS_Y - s.profile[Math.round(xToI(s.tool.x))], Math.min(10, 2 + sanded * 2), 0.6);
        sanding = true;
      }
    }
  }

  // ---- oiling ----
  if (s.finish.oiling > 0 && s.finish.oiling < 1) {
    s.finish.oiling += dt / 2.5;
    if (s.finish.oiling >= 1) {
      s.finish.oiling = 1;
      s.oiled = true;
    }
  }

  // ---- wall & match ----
  let minWall = 1e9, errSum = 0, nPts = 0, over = 0;
  for (let i = CLAMP; i < N - CLAMP; i++) {
    const r = s.profile[i];
    if (r < minWall) minWall = r;
    if (s.tgt) {
      const e = r - s.tgt[i];
      errSum += Math.abs(e);
      nPts++;
      if (-e > over) over = -e;
    }
  }
  if (s.tgt && nPts) {
    const err = errSum / nPts;
    s.match = clamp(Math.round(100 * (1 - (err + 1.6 * over) / R0) * 10) / 10, 0, 100);
    s.over = over;
  } else {
    s.match = 0; s.over = 0;
  }
  s.finish.roughness = computeRoughness(s);

  if (minWall < 15 && !s.warnedThin) {
    s.warnedThin = true;
    toast(s, 'The wall is getting paper-thin — ease off!');
  }
  if (minWall < 7 && !s.cracked) {
    s.cracked = true;
    s.shake = 12;
    s.events.push({ type: 'crack' });
    toast(s, 'CRACK! The piece blew out — the wall was too thin.', 4.5);
    spawn(s, X0 + (X1 - X0) * (0.3 + Math.random() * 0.4), AXIS_Y - 20, 60, 2);
  }

  // ---- completion ----
  if (!s.done && s.tgt && s.match >= 96.5 && s.over < 2 && s.t > 4) {
    s.done = true;
    s.tool.auto = false;
    s.finish.scratch = TOOLS[s.tool.type].scratch;
    s.events.push({ type: 'done' });
    toast(s, 'Turning complete — now sand & oil it!', 4);
  }

  // ---- status ----
  if (s.displayed) s.status = 'DISPLAY';
  else if (s.honing > 0) s.status = 'HONING';
  else if (s.done && s.finish.oiling > 0 && s.finish.oiling < 1) s.status = 'OILING';
  else if (s.done && sanding) s.status = 'SANDING';
  else if (s.done) s.status = 'DONE';
  else if (cutting) s.status = s.chatter > 0.3 ? 'CHATTER' : 'CUTTING';
  else s.status = s.cracked ? 'CRACKED' : 'IDLE';

  // ---- particles ----
  for (const p of s.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 640 * dt;
    p.vx *= 1 - 0.5 * dt;
    p.rot += p.vr * dt;
    p.life -= dt;
  }
  s.particles = s.particles.filter((p) => p.life > 0 && p.y < H + 30);
}
