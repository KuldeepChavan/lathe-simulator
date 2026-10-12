import { N, X0, X1, AXIS_Y, R0, CLAMP, DX, BX, clamp, H } from './geom.js';
import { sampleTarget, makeBlank } from './shapes.js';

export const TOOLS = {
  gouge:     { name: 'Gouge',        w: 30, safe: 20, desc: 'Wide & fast — hollows and general shaping', edge: (u) => Math.max(0, 1 - u * u) },
  skew:      { name: 'Skew Chisel',  w: 14, safe: 12, desc: 'Fine, precise cuts for small details',     edge: (u) => Math.max(0, 1 - Math.abs(u)) },
  parting:   { name: 'Parting Tool', w: 7,  safe: 34, desc: 'Thin walls, beads and deep grooves',        edge: (u) => (Math.abs(u) < 0.85 ? 1 : 0) },
};

const xToI = (x) => ((x - X0) / (X1 - X0)) * (N - 1);

function makeGrain() {
  const g = [];
  for (let i = 0; i < 46; i++) {
    g.push({
      a: Math.random() * Math.PI * 2,          // surface angle on the cylinder
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
    rpm, phase: 0, t: 0,
    tool: { type: 'gouge', x: 380, r: R0 + 18, engaged: false, auto: false, dir: 1, prevX: 380 },
    removedVol: 0,
    status: 'IDLE', match: 0, over: 0,
    done: false, polished: false, cracked: false, warnedThin: false, warnedLow: false,
    shake: 0, chatter: 0,
    msg: { text: '', until: 0 },
    events: [], particles: [],
    grain: makeGrain(),
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

export function step(s, dt, keys = new Set()) {
  dt = Math.min(dt, 0.05);
  s.t += dt;
  s.shake *= Math.max(0, 1 - 5 * dt);
  s.phase += (Math.PI * 2 * s.rpm / 60) * dt;

  // ---- keyboard movement ----
  const kx = 300 * dt, kr = 240 * dt;
  if (keys.has('ArrowLeft')) s.tool.x -= kx;
  if (keys.has('ArrowRight')) s.tool.x += kx;
  if (keys.has('ArrowUp')) s.tool.r += kr;
  if (keys.has('ArrowDown')) s.tool.r -= kr;
  s.tool.x = clamp(s.tool.x, X0 + 8, X1 - 8);
  s.tool.r = clamp(s.tool.r, 0, 132);

  // ---- auto-turn (demo) ----
  if (s.tool.auto && !s.done) {
    s.tool.x += s.tool.dir * 160 * dt;
    if (s.tool.x > X1 - 14) { s.tool.x = X1 - 14; s.tool.dir = -1; }
    else if (s.tool.x < X0 + 14) { s.tool.x = X0 + 14; s.tool.dir = 1; }
    s.tool.r = s.tgt[Math.round(xToI(s.tool.x))] + 1;
    s.tool.engaged = true;
  }

  // ---- low RPM warning ----
  if (s.tool.engaged && s.rpm < 420 && s.rpm >= 40 && !s.warnedLow && !s.done) {
    s.warnedLow = true;
    toast(s, 'Below ~420 RPM the tool starts to chatter — raise the speed.');
  }
  if (s.rpm >= 500) s.warnedLow = false;

  // ---- cutting ----
  let cutting = false, cutVolFrame = 0, maxD = 0;
  if (s.tool.engaged && s.rpm >= 40 && !s.done) {
    const tool = TOOLS[s.tool.type];
    const half = tool.w / 2;
    const i0 = Math.max(CLAMP, Math.floor(xToI(s.tool.x - half)));
    const i1 = Math.min(N - 1 - CLAMP, Math.ceil(xToI(s.tool.x + half)));
    if (i1 > i0) {
      for (let i = i0; i <= i1; i++) {
        const d = s.profile[i] - s.tool.r;
        if (d > maxD) maxD = d;
      }
      const rate = (10 + s.rpm * 0.022) * dt; // max material removal this frame
      const feed = Math.abs(s.tool.x - s.tool.prevX) / Math.max(dt, 1e-4);
      for (let i = i0; i <= i1; i++) {
        const u = Math.abs(BX(i) - s.tool.x) / half;
        const e = tool.edge(u);
        if (e <= 0) continue;
        const d = s.profile[i] - s.tool.r;
        if (d > 0.02) {
          const rem = Math.min(d, rate * e * (1 + feed / 520));
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
        spawn(s, s.tool.x, AXIS_Y - s.profile[Math.round(xToI(s.tool.x))],
          Math.min(16, 2 + cutVolFrame * 0.9), 1);
      }
      // tear-out: too deep a cut at too low a speed
      if (maxD > tool.safe && s.rpm < 1700) {
        const p = Math.min(0.9, ((maxD - tool.safe) / 24) * (1500 / s.rpm) * dt * 3.2);
        if (Math.random() < p) doTear(s, i0, i1);
      }
      // chatter: low speed + cutting -> scalloped marks
      if (s.rpm < 700) {
        s.chatter = Math.min(1, s.chatter + dt * 2.6);
        for (let i = i0; i <= i1; i++) {
          const wv = Math.max(0, Math.sin(BX(i) * 0.09 + s.t * 46));
          s.profile[i] = Math.max(1, s.profile[i] - wv * s.chatter * 26 * dt);
        }
      }
    }
  }
  s.chatter = Math.max(0, s.chatter - ((cutting && s.rpm < 700) ? 0 : dt * 2.2));
  s.tool.prevX = s.tool.x;

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
    s.events.push({ type: 'done' });
    toast(s, 'Turning complete — nice work!', 4);
  }

  s.status = s.done
    ? (s.polished ? 'DISPLAY' : 'DONE')
    : cutting
      ? (s.chatter > 0.3 ? 'CHATTER' : 'CUTTING')
      : s.cracked ? 'CRACKED' : 'IDLE';

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
