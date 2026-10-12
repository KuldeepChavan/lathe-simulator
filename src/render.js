import { W, H, N, X0, X1, AXIS_Y, R0, CLAMP, RAIL_Y, BX } from './geom.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function profileAt(s, x) {
  const u = ((x - X0) / (X1 - X0)) * (N - 1);
  const i = Math.min(N - 2, Math.max(0, Math.floor(u)));
  return s.profile[i] + (s.profile[i + 1] - s.profile[i]) * (u - i);
}

export function draw(ctx, s) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (s.shake > 0.05) {
    ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
  }

  // ---------- background: workshop wall + bench ----------
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#252118');
  bg.addColorStop(0.55, '#1b1712');
  bg.addColorStop(1, '#121009');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.022)';
  ctx.lineWidth = 1;
  for (let x = 40; x < W; x += 56) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 470); ctx.stroke();
  }
  // bench
  ctx.fillStyle = '#241b12';
  ctx.fillRect(0, 470, W, H - 470);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 470, W, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 472, W, 6);

  // ---------- lathe bed ----------
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(480, 470, 385, 10, 0, 0, Math.PI * 2); ctx.fill();
  const bed = ctx.createLinearGradient(0, 418, 0, 466);
  bed.addColorStop(0, '#454e58');
  bed.addColorStop(0.5, '#333b44');
  bed.addColorStop(1, '#242b32');
  ctx.fillStyle = bed;
  roundRect(ctx, 92, 418, 776, 46, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(96, 420, 768, 2);
  ctx.fillStyle = '#1d2228';
  ctx.fillRect(120, 464, 44, 6);
  ctx.fillRect(796, 464, 44, 6);

  // centerline
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.moveTo(96, AXIS_Y); ctx.lineTo(864, AXIS_Y); ctx.stroke();
  ctx.restore();

  // ---------- headstock ----------
  const hs = ctx.createLinearGradient(0, 244, 0, 418);
  hs.addColorStop(0, '#4a525c');
  hs.addColorStop(1, '#30373f');
  ctx.fillStyle = hs;
  roundRect(ctx, 76, 244, 104, 174, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  for (let y = 262; y < 300; y += 8) {
    ctx.beginPath(); ctx.moveTo(88, y); ctx.lineTo(150, y); ctx.stroke();
  }
  // handwheel (spins with the spindle)
  const hx = 128, hy = 352, hr = 29;
  ctx.strokeStyle = '#5a646f';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 4;
  const wph = s.phase * 0.6;
  for (let k = 0; k < 3; k++) {
    const a = wph + (k * Math.PI * 2) / 3;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * (hr - 4), hy + Math.sin(a) * (hr - 4)); ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.fillStyle = '#6a7480';
  ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8b95a1';
  ctx.font = '11px ui-monospace, SFMono-Regular, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s.rpm > 0 ? `${Math.round(s.rpm)} rpm` : 'stopped', hx, 404);

  // ---------- tailstock ----------
  const ts = ctx.createLinearGradient(0, 272, 0, 418);
  ts.addColorStop(0, '#4a525c');
  ts.addColorStop(1, '#2f363e');
  ctx.fillStyle = ts;
  roundRect(ctx, 742, 272, 84, 146, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
  ctx.fillStyle = '#3c444d';
  roundRect(ctx, 772, 262, 10, 14, 3); ctx.fill();
  roundRect(ctx, 758, 254, 38, 9, 4); ctx.fill();

  // ---------- tool rest ----------
  const rail = ctx.createLinearGradient(0, 392, 0, 401);
  rail.addColorStop(0, '#5b656f');
  rail.addColorStop(1, '#39414a');
  ctx.fillStyle = rail;
  roundRect(ctx, 232, 392, 578, 9, 4);
  ctx.fill();
  ctx.fillStyle = '#2c333b';
  ctx.fillRect(262, 401, 12, 17);
  ctx.fillRect(760, 401, 12, 17);

  // ---------- the blank (spinning wood) ----------
  const p = s.profile;
  const path = new Path2D();
  path.moveTo(BX(0), AXIS_Y - p[0]);
  for (let i = 1; i < N; i++) path.lineTo(BX(i), AXIS_Y - p[i]);
  path.lineTo(BX(N - 1), AXIS_Y + p[N - 1]);
  for (let i = N - 1; i >= 0; i--) path.lineTo(BX(i), AXIS_Y + p[i]);
  path.closePath();

  const wood = ctx.createLinearGradient(0, AXIS_Y - R0, 0, AXIS_Y + R0);
  wood.addColorStop(0, '#54371f');
  wood.addColorStop(0.16, '#7d5330');
  wood.addColorStop(0.32, '#96683a');
  wood.addColorStop(0.5, '#83552e');
  wood.addColorStop(0.75, '#5d3b21');
  wood.addColorStop(1, '#38220f');
  ctx.fillStyle = wood;
  ctx.fill(path);

  // wood grain streaks scrolling with the rotation (physically: surface
  // angle -> y = r(x) * sin(angle + phase), visible on the near half)
  ctx.save();
  ctx.clip(path);
  for (const g of s.grain) {
    const ph = g.a + s.phase;
    const c = Math.cos(ph);
    if (c <= 0.04) continue;
    const sn = Math.sin(ph);
    ctx.globalAlpha = g.alpha * (0.25 + 0.75 * c);
    ctx.strokeStyle = g.dark ? 'rgba(58,36,20,1)' : 'rgba(228,192,142,1)';
    ctx.lineWidth = g.w;
    ctx.beginPath();
    for (let x = X0 - 2; x <= X1 + 2; x += 6) {
      const r = profileAt(s, x);
      const wob = Math.sin(x * 0.021 + g.c1) * g.amp1 + Math.sin(x * 0.047 + g.c2) * g.amp2;
      const y = AXIS_Y - r * (sn + wob * 0.35);
      if (x === X0 - 2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // specular band
  const spec = ctx.createLinearGradient(0, AXIS_Y - 44, 0, AXIS_Y + 12);
  spec.addColorStop(0, 'rgba(255,235,200,0)');
  spec.addColorStop(0.55, 'rgba(255,235,200,0.10)');
  spec.addColorStop(1, 'rgba(255,235,200,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(X0 - 4, AXIS_Y - R0, X1 - X0 + 8, R0 * 2);
  if (s.polished) {
    const sy = AXIS_Y - 26 + Math.sin(s.t * 0.8) * 16;
    const g2 = ctx.createLinearGradient(0, sy - 16, 0, sy + 16);
    g2.addColorStop(0, 'rgba(255,240,210,0)');
    g2.addColorStop(0.5, 'rgba(255,240,210,0.22)');
    g2.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(X0 - 4, sy - 16, X1 - X0 + 8, 32);
    ctx.fillStyle = 'rgba(255,235,200,0.05)';
    ctx.fillRect(X0 - 4, AXIS_Y - R0, X1 - X0 + 8, R0 * 2);
  }
  ctx.restore();

  // right end face edge
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(BX(N - 1), AXIS_Y - p[N - 1]);
  ctx.lineTo(BX(N - 1), AXIS_Y + p[N - 1]);
  ctx.stroke();
  ctx.lineWidth = 1;

  // ---------- chuck collar (over blank left end) ----------
  const col = ctx.createLinearGradient(0, 264, 0, 336);
  col.addColorStop(0, '#6a7480');
  col.addColorStop(0.5, '#4a525c');
  col.addColorStop(1, '#2f363e');
  ctx.fillStyle = col;
  roundRect(ctx, 154, 264, 30, 72, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();
  // rotating marker on the drive sleeve
  const my = AXIS_Y + 19 * Math.sin(s.phase);
  const mc = Math.max(0, Math.cos(s.phase));
  ctx.strokeStyle = `rgba(18,22,26,${0.2 + 0.8 * mc})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(159, my); ctx.lineTo(179, my); ctx.stroke();
  ctx.lineWidth = 1;

  // ---------- tailstock quill + center (over blank right end) ----------
  const quill = ctx.createLinearGradient(0, 291, 0, 309);
  quill.addColorStop(0, '#69737e');
  quill.addColorStop(1, '#3d454e');
  ctx.fillStyle = quill;
  roundRect(ctx, 726, 291, 34, 18, 3);
  ctx.fill();
  ctx.fillStyle = '#59636e';
  ctx.beginPath();
  ctx.moveTo(726, 295); ctx.lineTo(726, 305); ctx.lineTo(714, 300);
  ctx.closePath(); ctx.fill();

  // ---------- target outline ----------
  if (s.tgt) {
    ctx.save();
    ctx.strokeStyle = 'rgba(110,214,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let i = CLAMP; i < N - CLAMP; i++) {
        const x = BX(i), y = AXIS_Y + side * s.tgt[i];
        if (i === CLAMP) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(110,214,255,0.8)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('target', X1 + 6, AXIS_Y - s.tgt[N - 1] - 4);
  }

  // ---------- live profile feedback (top edge) ----------
  for (let i = CLAMP; i < N - CLAMP - 1; i++) {
    const mid = (p[i] + p[i + 1]) / 2;
    let col;
    if (!s.tgt) col = 'rgba(236,227,211,0.28)';
    else {
      const d = mid - s.tgt[i];
      col = d > 1.2 ? 'rgba(240,161,60,0.95)'
        : d < -1.2 ? 'rgba(232,96,79,0.95)'
        : 'rgba(116,208,132,0.95)';
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(BX(i), AXIS_Y - p[i]);
    ctx.lineTo(BX(i + 1), AXIS_Y - p[i + 1]);
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // ---------- cutting tool ----------
  drawTool(ctx, s);

  // ---------- particles ----------
  for (const pt of s.particles) {
    const a = Math.max(0, pt.life / pt.max);
    if (pt.kind === 'dust') {
      ctx.globalAlpha = a * 0.3;
      ctx.fillStyle = '#c9a06a';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * 1.6, 0, 6.283); ctx.fill();
    } else if (pt.kind === 'chip') {
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);
      ctx.fillStyle = '#b9834c';
      ctx.beginPath();
      ctx.moveTo(-pt.size, pt.size * 0.7);
      ctx.lineTo(pt.size, 0);
      ctx.lineTo(-pt.size * 0.4, -pt.size * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.globalAlpha = a * 0.9;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);
      ctx.strokeStyle = '#dfb87f';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, pt.size, 0.3, 4.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(pt.size * 0.4, -pt.size * 0.2, pt.size * 0.5, 2.6, 6.9); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  // ---------- toast ----------
  if (s.t < s.msg.until) {
    const remain = s.msg.until - s.t;
    ctx.globalAlpha = Math.min(1, remain / 0.4);
    ctx.font = '600 15px system-ui, sans-serif';
    const tw = ctx.measureText(s.msg.text).width;
    const cx = W / 2, cy = 44;
    ctx.fillStyle = 'rgba(24,18,10,0.9)';
    roundRect(ctx, cx - tw / 2 - 14, cy - 17, tw + 28, 34, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,161,60,0.6)';
    ctx.stroke();
    ctx.fillStyle = '#ffd9a0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.msg.text, cx, cy);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  ctx.restore(); // shake

  // ---------- vignette ----------
  const v = ctx.createRadialGradient(480, 270, 240, 480, 300, 640);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  // spotlight when the piece is on display
  if (s.polished) {
    const sp = ctx.createRadialGradient(452, 300, 40, 452, 300, 340);
    sp.addColorStop(0, 'rgba(0,0,0,0)');
    sp.addColorStop(0.55, 'rgba(8,6,4,0.25)');
    sp.addColorStop(1, 'rgba(8,6,4,0.72)');
    ctx.fillStyle = sp;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawTool(ctx, s) {
  const t = s.tool;
  const ch = s.chatter;
  const jx = ch > 0 ? Math.sin(s.t * 73) * 1.7 * ch : 0;
  const jy = ch > 0 ? Math.cos(s.t * 97) * 1.5 * ch : 0;
  const tipX = t.x + jx;
  const tipY = AXIS_Y - t.r + jy + (t.engaged ? 1.2 : 0);
  // contact point on the rest rail
  const cxp = t.x + (RAIL_Y - tipY) / 1.45;
  const cyp = RAIL_Y;

  // shadow on the rail
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(cxp, cyp + 7, 26, 3.5, 0, 0, Math.PI * 2); ctx.fill();

  // steel shaft
  const steel = ctx.createLinearGradient(tipX, tipY, cxp, cyp);
  steel.addColorStop(0, '#d8dee6');
  steel.addColorStop(1, '#8b95a1');
  ctx.strokeStyle = steel;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(cxp, cyp); ctx.stroke();

  // carbide tip
  ctx.fillStyle = '#e8edf2';
  ctx.beginPath();
  ctx.moveTo(tipX - 2, tipY + 3);
  ctx.lineTo(tipX + 4, tipY + 3);
  ctx.lineTo(tipX + 1, tipY - 4);
  ctx.closePath(); ctx.fill();

  // steel highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tipX - 1, tipY - 1); ctx.lineTo(cxp - 4, cyp - 6); ctx.stroke();

  // handle (up to the right from the contact point)
  const hX = cxp + 72, hY = cyp - 28;
  ctx.strokeStyle = '#a5713d';
  ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(cxp - 10, cyp - 3); ctx.lineTo(hX, hY); ctx.stroke();
  ctx.strokeStyle = '#7c4a22';
  ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(cxp + 14, cyp - 10); ctx.lineTo(cxp + 34, cyp - 16); ctx.stroke();
  ctx.fillStyle = '#5d3a1c';
  ctx.beginPath(); ctx.arc(hX + 1, hY - 1, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1;

  // cutting glow
  if (s.status === 'CUTTING' || s.status === 'CHATTER') {
    const g = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 18);
    g.addColorStop(0, 'rgba(255,190,90,0.55)');
    g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(tipX, tipY, 18, 0, Math.PI * 2); ctx.fill();
  }
}
