import { useEffect, useRef, useState } from 'react';
import { W, H, X0, X1, AXIS_Y, R0, clamp } from './geom.js';
import { SHAPES, shapePath, sampleTarget } from './shapes.js';
import { SPECIES, OIL_THRESHOLD } from './species.js';
import { createState, step, TOOLS, GRITS, gradeTurning } from './engine.js';
import { draw } from './render.js';
import { SoundEngine } from './audio.js';

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const STATUS_LABEL = {
  IDLE: '● Idle',
  CUTTING: '✂ Cutting',
  CHATTER: '⚠ Chatter — speed up the spindle!',
  SANDING: '🧽 Sanding…',
  HONING: '🔪 Honing the edge…',
  OILING: '🫗 Oiling…',
  DONE: '✓ Complete — finish it below',
  CRACKED: '✖ Cracked — too thin',
  DISPLAY: '✨ On display',
};
const surfaceLabel = (r) => (r > 40 ? 'Rough' : r > 20 ? 'Bumpy' : r > 10 ? 'Smooth' : 'Glass');
const GALLERY_KEY = 'lathe-gallery-v1';
const readGallery = () => {
  try {
    const g = JSON.parse(localStorage.getItem(GALLERY_KEY));
    return g && typeof g.count === 'number' ? g : { count: 0, best: null };
  } catch {
    return { count: 0, best: null };
  }
};

const snap = (s) => ({
  rpm: s.rpm,
  shape: s.shapeId,
  tool: s.tool.type,
  auto: s.tool.auto,
  species: s.speciesId,
  match: s.match,
  removedPct: s.initialVol ? (s.removedVol / s.initialVol) * 100 : 0,
  status: s.status,
  done: s.done,
  displayed: s.displayed,
  oiled: s.oiled,
  cracked: s.cracked,
  t: s.t,
  edge: s.edge,
  honing: s.honing > 0,
  roughness: s.finish.roughness,
  grit: s.finish.grit,
  sanding: s.finish.sanding,
  autoSand: s.finish.autoSand,
  grade: s.grade,
});

export default function App() {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const keysRef = useRef(new Set());
  const pointerRef = useRef({ down: false, id: null });
  const btnRef = useRef(false);
  const soundRef = useRef(null);
  const prevDone = useRef(false);
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches
  );
  const [gallery, setGallery] = useState(readGallery);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const h = () => setCoarse(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', h);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', h); };
  }, []);

  if (!stateRef.current) stateRef.current = createState('vase', 1200);

  const [ui, setUi] = useState({ ...snap(stateRef.current), sound: false });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (ui.done && !ui.displayed && !prevDone.current) setBannerDismissed(false);
    prevDone.current = ui.done;
  }, [ui.done, ui.displayed]);

  // ---------- main loop ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now) => {
      const s = stateRef.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      s.tool.engaged = s.tool.auto || s.finish.autoSand || pointerRef.current.down || btnRef.current || keysRef.current.has(' ');
      step(s, dt, keysRef.current);

      const snd = soundRef.current;
      if (snd) {
        for (const ev of s.events) snd.onEvent(ev, s);
        if (snd.enabled) snd.update(s);
      }
      s.events.length = 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, s);

      acc += dt;
      if (acc > 0.12) {
        acc = 0;
        setUi((u) => ({ ...u, ...snap(s) }));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const kd = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
        if (tag === 'BUTTON') e.target.blur();
        keysRef.current.add(e.key);
      }
      const k = e.key.toLowerCase();
      if (k === 'h' && !e.repeat) {
        e.preventDefault();
        if (tag === 'BUTTON') e.target.blur();
        hone();
      }
      if (k === 's' && !e.repeat && stateRef.current.done) {
        e.preventDefault();
        if (tag === 'BUTTON') e.target.blur();
        toggleSand();
      }
    };
    const ku = (e) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- pointer controls ----------
  const toWorld = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const moveTool = (e) => {
    const s = stateRef.current;
    const p = pointerRef.current;
    if (e.pointerType === 'touch' && p.id !== null && p.id !== e.pointerId) return;
    const { x, y } = toWorld(e);
    // on touch, aim above the finger so the tool tip stays visible
    const yOff = e.pointerType === 'touch' ? 110 : 0;
    s.tool.x = clamp(x, X0 + 8, X1 - 8);
    s.tool.r = clamp(AXIS_Y - (y - yOff), 0, 132);
    s.touchPos = e.pointerType === 'touch' ? { x, y } : null;
    if (s.tool.auto) {
      s.tool.auto = false;
      setUi((u) => ({ ...u, auto: false }));
    }
    if (s.finish.autoSand) {
      s.finish.autoSand = false;
      setUi((u) => ({ ...u, autoSand: false }));
    }
  };
  const onDown = (e) => {
    const p = pointerRef.current;
    if (e.pointerType === 'touch') {
      if (p.id !== null) return; // ignore extra fingers on the canvas
      p.id = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    p.down = true;
    moveTool(e);
  };
  const onMove = (e) => moveTool(e);
  const onUp = (e) => {
    const p = pointerRef.current;
    if (e.pointerType === 'touch' && p.id === e.pointerId) {
      p.id = null;
      stateRef.current.touchPos = null;
    }
    p.down = false;
  };
  const cutDown = (e) => {
    e.preventDefault();
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    btnRef.current = true;
  };
  const cutUp = () => { btnRef.current = false; };

  // ---------- actions ----------
  const selectShape = (id) => {
    const s = stateRef.current;
    s.shapeId = id;
    s.tgt = sampleTarget(id);
    s.done = false;
    s.displayed = false;
    s.oiled = false;
    s.cracked = false;
    s.grade = null;
    s.warnedThin = false;
    s.finish.sanding = false;
    s.finish.autoSand = false;
    if (id === 'free') s.tool.auto = false;
    setUi((u) => ({ ...u, shape: id, done: false, displayed: false, oiled: false, cracked: false, auto: s.tool.auto, grade: null }));
    setBannerDismissed(false);
  };

  const selectSpecies = (id) => {
    const s = stateRef.current;
    s.speciesId = id;
    setUi((u) => ({ ...u, species: id }));
  };

  const selectTool = (id) => {
    stateRef.current.tool.type = id;
    setUi((u) => ({ ...u, tool: id }));
  };

  const setRpm = (v) => {
    stateRef.current.rpm = v;
    setUi((u) => ({ ...u, rpm: v }));
  };

  const toggleSound = () => {
    if (!soundRef.current) soundRef.current = new SoundEngine();
    const on = !soundRef.current.enabled;
    soundRef.current.setEnabled(on);
    setUi((u) => ({ ...u, sound: on }));
  };

  const toggleAuto = () => {
    const s = stateRef.current;
    if (s.shapeId === 'free' || s.done) return;
    s.tool.auto = !s.tool.auto;
    setUi((u) => ({ ...u, auto: s.tool.auto }));
  };

  const hone = () => {
    const s = stateRef.current;
    if (s.honing > 0 || s.edge > 0.99 || s.displayed) return;
    s.honing = 0.001;
    s.events.push({ type: 'hone' });
  };

  const setGrit = (id) => {
    stateRef.current.finish.grit = id;
    setUi((u) => ({ ...u, grit: id }));
  };

  const toggleSand = () => {
    const s = stateRef.current;
    if (!s.done || s.displayed) return;
    s.finish.sanding = !s.finish.sanding;
    if (!s.finish.sanding) s.finish.autoSand = false;
    setUi((u) => ({ ...u, sanding: s.finish.sanding, autoSand: s.finish.autoSand }));
  };

  const autoSand = () => {
    const s = stateRef.current;
    if (!s.done || s.displayed) return;
    s.finish.sanding = true;
    s.finish.autoSand = true;
    s.finish.sandPasses = 0;
    setUi((u) => ({ ...u, sanding: true, autoSand: true }));
  };

  const applyOil = () => {
    const s = stateRef.current;
    if (!s.done || s.oiled || s.finish.oiling > 0 || s.finish.roughness > OIL_THRESHOLD) return;
    s.finish.oiling = 0.001;
    s.events.push({ type: 'oil' });
  };

  const display = () => {
    const s = stateRef.current;
    if (!s.done || s.displayed) return;
    s.displayed = true;
    s.rpm = 0;
    s.tool.auto = false;
    s.finish.sanding = false;
    s.finish.autoSand = false;
    s.grade = gradeTurning(s);
    s.events.push({ type: 'done' });
    const g = readGallery();
    g.count += 1;
    if (!g.best || s.grade.score > g.best.score) {
      g.best = { score: s.grade.score, letter: s.grade.letter, shape: s.shapeId, species: s.speciesId };
    }
    try { localStorage.setItem(GALLERY_KEY, JSON.stringify(g)); } catch { /* private mode */ }
    setGallery(g);
    setUi((u) => ({ ...u, displayed: true, rpm: 0, auto: false, grade: s.grade }));
  };

  const reset = () => {
    const cur = stateRef.current;
    const s = createState(cur.shapeId, cur.rpm);
    s.tool.type = cur.tool.type;
    s.speciesId = cur.speciesId;
    stateRef.current = s;
    setBannerDismissed(false);
    setUi((u) => ({ ...u, ...snap(s) }));
  };

  const savePng = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement('a');
    a.download = `lathe-${stateRef.current.shapeId}-${stateRef.current.speciesId}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };

  const shapeName = SHAPES.find((sh) => sh.id === ui.shape);
  const speciesName = SPECIES[ui.species].name;
  const canOil = ui.done && !ui.displayed && !ui.oiled && ui.roughness <= OIL_THRESHOLD;

  return (
    <div className="app">
      <header>
        <div>
          <h1>🪵 Wood Lathe Simulator</h1>
          <p className="sub">
            Rough the spinning blank to the target profile, then sand and oil it for a pro finish.
            Mind the RPM, feed rate, cut depth and your edge — just like a real lathe.
          </p>
        </div>
        <div className="head-actions">
          {gallery.count > 0 && (
            <span className="gallery-chip">
              🏆 {gallery.count} finished{gallery.best ? ` · best ${gallery.best.letter} (${gallery.best.score})` : ''}
            </span>
          )}
          <button className={`btn ghost ${ui.sound ? 'on' : ''}`} onClick={toggleSound}>
            {ui.sound ? '🔊 Sound on' : '🔇 Sound off'}
          </button>
        </div>
      </header>

      <div className="layout">
        <div className="stage">
          <div className="canvas-wrap">
            <div className="target-chip">
              {ui.shape === 'free'
                ? '✋ Freeform — shape it your way'
                : `Target: ${shapeName.emoji} ${shapeName.name}`}
              {' · '}{speciesName}
            </div>

            <canvas
              ref={canvasRef}
              className="lathe"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onContextMenu={(e) => e.preventDefault()}
            />

            {ui.done && !ui.displayed && !bannerDismissed && (
              <div className="overlay">
                <div className="card overlay-card">
                  <div className="big">🏆</div>
                  <h2>Turning complete!</h2>
                  <p>
                    Match {ui.match.toFixed(1)}% · material removed {ui.removedPct.toFixed(1)}% ·
                    {` time ${fmt(ui.t)}`}
                    {ui.cracked ? ' · (with a crack — ouch)' : ''}
                  </p>
                  <p className="sub2">Sand it smooth, apply oil, and display it — or skip straight to the display.</p>
                  <div className="row">
                    <button className="btn primary" onClick={() => {
                      setBannerDismissed(false);
                      document.getElementById('progress-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }}>
                      🧽 Start finishing
                    </button>
                    <button className="btn ghost" onClick={display}>Skip → display</button>
                  </div>
                  <button className="linklike" onClick={() => setBannerDismissed(true)}>keep turning</button>
                </div>
              </div>
            )}

            {ui.displayed && (
              <div className="finish-chip">
                <span className="grade-chip">
                  Grade {ui.grade?.letter} · {ui.grade?.score}{ui.oiled ? ' · oiled' : ''}
                </span>
                <button className="btn ghost" onClick={savePng}>💾 Save PNG</button>
                <button className="btn ghost" onClick={reset}>↺ New blank</button>
              </div>
            )}

            {coarse && !ui.displayed && (
              <button
                className="cut-btn"
                onPointerDown={cutDown}
                onPointerUp={cutUp}
                onPointerCancel={cutUp}
                onPointerLeave={cutUp}
                onContextMenu={(e) => e.preventDefault()}
              >
                {ui.done ? '🧽' : '✂'}<span>{ui.done ? 'PRESS' : 'CUT'}</span>
              </button>
            )}
          </div>

          <div className="legend">
            <span><i className="dot need" /> more to cut</span>
            <span><i className="dot on" /> on target</span>
            <span><i className="dot over" /> overcut — wood gone</span>
            {coarse ? (
              <span className="keys">👆 drag on the wood to carve · hold the button to press</span>
            ) : (
              <span className="keys">🖱 drag to cut · ← → feed · ↑ ↓ lift · SPACE press · H hone · S sand</span>
            )}
          </div>
        </div>

        <aside className="panel">
          <div className="card">
            <h3>Target shape</h3>
            <div className="shape-grid">
              {SHAPES.map((sh) => (
                <button
                  key={sh.id}
                  className={`shape-btn ${ui.shape === sh.id ? 'active' : ''}`}
                  onClick={() => selectShape(sh.id)}
                >
                  {sh.ctrl ? (
                    <svg viewBox="0 0 46 34"><path d={shapePath(sh.id)} /></svg>
                  ) : (
                    <span className="thumb-emoji">{sh.emoji}</span>
                  )}
                  <span>{sh.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Wood species</h3>
            <div className="species-grid">
              {Object.values(SPECIES).map((sp) => (
                <button
                  key={sp.id}
                  className={`species-btn ${ui.species === sp.id ? 'active' : ''}`}
                  onClick={() => selectSpecies(sp.id)}
                  title={`${sp.name} — ${sp.hardness.toLowerCase()} wood`}
                >
                  <span
                    className="swatch"
                    style={{ background: `linear-gradient(135deg, ${sp.wood[2]}, ${sp.wood[1]} 45%, ${sp.wood[5]})` }}
                  />
                  <span>{sp.name}</span>
                  <small>{sp.hardness}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Tool</h3>
            <div className="tool-list">
              {Object.entries(TOOLS).map(([id, t]) => (
                <button
                  key={id}
                  className={`tool-btn ${ui.tool === id ? 'active' : ''}`}
                  onClick={() => selectTool(id)}
                >
                  <b>{t.name}</b>
                  <small>{t.desc}</small>
                </button>
              ))}
            </div>
            <div className="edge-wrap">
              <div className="edge-label">
                <small>Tool edge</small>
                <b>{Math.round(ui.edge * 100)}%</b>
              </div>
              <div className={`edge-bar ${ui.edge < 0.45 ? 'dull' : ui.edge < 0.7 ? 'warn' : 'ok'}`}>
                <div style={{ width: `${ui.edge * 100}%` }} />
              </div>
            </div>
            <button
              className={`btn ${ui.honing ? 'primary' : 'ghost'}`}
              disabled={ui.honing || ui.edge > 0.99 || ui.displayed}
              onClick={hone}
            >
              {ui.honing ? '🔪 Honing…' : '🔪 Hone edge (H)'}
            </button>
          </div>

          <div className="card">
            <h3>Spindle speed</h3>
            <div className="rpm-row">
              <input
                type="range"
                min="0"
                max="2400"
                step="20"
                value={ui.rpm}
                onChange={(e) => setRpm(+e.target.value)}
              />
              <span className="rpm-val">{ui.rpm} <small>RPM</small></span>
            </div>
            {ui.rpm > 0 && ui.rpm < 700 && <div className="warn">⚠ Low speed — risk of chatter marks (harder woods chatter sooner)</div>}
            {ui.rpm === 0 && <div className="warn off">Spindle stopped</div>}
          </div>

          <div className="card actions">
            <button
              className={`btn ${ui.auto ? 'primary' : ''}`}
              onClick={toggleAuto}
              disabled={ui.shape === 'free' || ui.done}
              title={ui.shape === 'free' ? 'Pick a target shape first' : 'Watch the lathe turn the piece by itself'}
            >
              {ui.auto ? '⏸ Stop auto-turn' : '▶ Auto-turn (demo)'}
            </button>
            <button className="btn ghost" onClick={reset}>↺ New blank</button>
          </div>

          <div className="card" id="progress-card">
            <h3>Progress</h3>
            <div className="match-big">
              {ui.shape === 'free' ? '—' : `${ui.match.toFixed(0)}%`}
              <small>target match</small>
            </div>
            <div className="matchbar">
              <div style={{ width: `${ui.shape === 'free' ? 0 : ui.match}%` }} />
            </div>
            <div className="stats">
              <div><small>Material removed</small><b>{ui.removedPct.toFixed(1)}%</b></div>
              <div><small>Elapsed</small><b>{fmt(ui.t)}</b></div>
            </div>
            <div className={`status ${ui.status}`}>{STATUS_LABEL[ui.status]}</div>

            {ui.done && !ui.displayed && (
              <div className="finish-block">
                <div className="surface-row">
                  <small>Surface</small>
                  <div className="surface-bar">
                    <div
                      className={ui.roughness > 40 ? 'rough' : ui.roughness > 20 ? 'bumpy' : ui.roughness > 10 ? 'smooth' : 'glass'}
                      style={{ width: `${ui.roughness}%` }}
                    />
                  </div>
                  <b>{surfaceLabel(ui.roughness)}</b>
                </div>
                <div className="grit-row">
                  <small className="grit-label">Grit</small>
                  {GRITS.map((g) => (
                    <button key={g.id} className={`grit-btn ${ui.grit === g.id ? 'active' : ''}`} onClick={() => setGrit(g.id)}>
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className="stats">
                  <button className={`btn ${ui.sanding ? 'primary' : ''}`} onClick={toggleSand} title="Drag on the wood to sand">
                    🧽 {ui.sanding ? 'Sand: ON' : 'Sand (S)'}
                  </button>
                  <button className="btn ghost" onClick={autoSand}>Auto-sand</button>
                </div>
                <button
                  className="btn ghost oil-btn"
                  disabled={!canOil}
                  onClick={applyOil}
                  title={canOil ? 'Apply oil to the finished surface' : `Surface must be at most "Smooth" (≤ ${OIL_THRESHOLD}) — use finer grit`}
                >
                  {ui.oiled ? '🫗 Oiled ✓'
                    : ui.roughness > OIL_THRESHOLD ? `🫗 Oil — smooth it first (≤ ${OIL_THRESHOLD})`
                    : '🫗 Apply oil'}
                </button>
                <button className="btn primary display-btn" onClick={display}>✨ Finish &amp; Display</button>
              </div>
            )}
          </div>
        </aside>
      </div>

      <footer className="tips">
        <b>Tips:</b> higher RPM allows deeper, safer cuts (harder woods like maple chatter sooner) ·
        feed slowly — fast, deep passes tear the wood out · hone your edge (H) before it dulls, or you'll
        scorch the surface · the green edge means you're on target, red means wood is gone forever ·
        after turning, sand rough→fine (80 → 400) and oil it, then display for a grade.
      </footer>
    </div>
  );
}
