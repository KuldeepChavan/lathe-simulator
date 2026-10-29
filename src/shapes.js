import { N, X0, X1, R0, BX, clamp } from './geom.js';

// Target profiles. Each is a list of [t, r] control points (t = 0..1 along the
// axis from chuck to tailstock, r = radius in world units), smoothed with a
// Catmull-Rom spline. Right end = "top" of the piece (rim / opening side).
export const SHAPES = [
  {
    id: 'vase', name: 'Vase', emoji: '🏺',
    ctrl: [[0, 32], [0.05, 36], [0.12, 20], [0.26, 30], [0.42, 64], [0.52, 68], [0.64, 56], [0.78, 30], [0.88, 26], [0.95, 30], [1, 32]],
  },
  {
    id: 'bowl', name: 'Bowl', emoji: '🥣',
    ctrl: [[0, 18], [0.07, 21], [0.18, 30], [0.38, 52], [0.60, 68], [0.80, 74], [0.92, 75], [1, 71]],
  },
  {
    id: 'bottle', name: 'Bottle', emoji: '🫙',
    ctrl: [[0, 34], [0.09, 38], [0.26, 56], [0.44, 64], [0.56, 62], [0.68, 44], [0.76, 28], [0.84, 25], [0.93, 26], [1, 28]],
  },
  {
    id: 'tumbler', name: 'Tumbler', emoji: '🕯️',
    ctrl: [[0, 42], [0.06, 45], [0.28, 50], [0.50, 55], [0.58, 57], [0.62, 64], [0.66, 57], [0.78, 59], [0.90, 61], [1, 62]],
  },
  {
    id: 'mushroom', name: 'Mushroom', emoji: '🍄',
    ctrl: [[0, 25], [0.34, 19], [0.48, 23], [0.60, 40], [0.72, 58], [0.84, 66], [0.93, 60], [1, 54]],
  },
  {
    id: 'pawn', name: 'Chess pawn', emoji: '♟️',
    ctrl: [[0, 38], [0.07, 44], [0.13, 27], [0.17, 40], [0.21, 23], [0.32, 19], [0.44, 23], [0.56, 42], [0.66, 38], [0.76, 21], [0.88, 17], [1, 20]],
  },
  {
    id: 'stool', name: 'Stool', emoji: '🪑',
    ctrl: [[0, 56], [0.07, 62], [0.14, 40], [0.19, 33], [0.45, 35], [0.54, 45], [0.62, 33], [0.76, 42], [0.90, 50], [1, 55]],
  },
  {
    id: 'candle', name: 'Candle', emoji: '🔥',
    ctrl: [[0, 52], [0.30, 42], [0.62, 32], [0.88, 27], [0.96, 30], [1, 33]],
  },
  {
    id: 'goblet', name: 'Goblet', emoji: '🍷',
    ctrl: [[0, 34], [0.07, 40], [0.14, 22], [0.22, 19], [0.40, 24], [0.5, 20], [0.60, 27], [0.72, 54], [0.85, 68], [0.93, 71], [1, 67]],
  },
  {
    id: 'finial', name: 'Finial', emoji: '🏛️',
    ctrl: [[0, 30], [0.10, 38], [0.20, 24], [0.32, 42], [0.42, 27], [0.54, 46], [0.64, 30], [0.76, 34], [0.88, 18], [1, 12]],
  },
  {
    id: 'hourglass', name: 'Hourglass', emoji: '⏳',
    ctrl: [[0, 56], [0.12, 62], [0.30, 40], [0.5, 26], [0.70, 40], [0.88, 62], [1, 56]],
  },
  { id: 'free', name: 'Freeform', emoji: '✋', ctrl: null },
];

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export function sampleTarget(id) {
  if (id === 'free') return null;
  const sh = SHAPES.find((s) => s.id === id);
  const pts = sh.ctrl;
  const arr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    let k = pts.length - 2;
    while (k > 0 && pts[k][0] > u) k--;
    const f = clamp((u - pts[k][0]) / (pts[k + 1][0] - pts[k][0]), 0, 1);
    const r0 = pts[Math.max(0, k - 1)][1];
    const r1 = pts[k][1];
    const r2 = pts[k + 1][1];
    const r3 = pts[Math.min(pts.length - 1, k + 2)][1];
    arr[i] = clamp(cr(r0, r1, r2, r3, f), 10, R0 - 3);
  }
  return arr;
}

// Rough cylinder blank with a little out-of-round so there's work to do.
// Guaranteed to be at least target + 1.5 so the shape is always achievable.
export function makeBlank(tgt) {
  const p = new Float32Array(N);
  const s1 = Math.random() * 10, s2 = Math.random() * 10, s3 = Math.random() * 10;
  for (let i = 0; i < N; i++) {
    const x = BX(i);
    let r = R0 - 4
      + 1.7 * Math.sin(x * 0.021 + s1)
      + 0.9 * Math.sin(x * 0.057 + s2)
      + 0.5 * Math.sin(x * 0.113 + s3);
    if (tgt) r = Math.max(r, tgt[i] + 1.5);
    p[i] = r;
  }
  return p;
}

// SVG path for shape thumbnails in the UI.
export function shapePath(id) {
  if (id === 'free') return '';
  const t = sampleTarget(id);
  const w = 46, h = 34;
  const px = (i) => 3 + ((BX(i) - X0) / (X1 - X0)) * (w - 6);
  const py = (i) => h / 2 + ((R0 - t[i]) / R0) * (h / 2 - 2);
  let d = '';
  for (let i = 0; i < N; i += 4) d += (d ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(i).toFixed(1);
  for (let i = N - 1; i >= 0; i -= 4) d += 'L' + px(i).toFixed(1) + ' ' + py(i).toFixed(1);
  return d + 'Z';
}
