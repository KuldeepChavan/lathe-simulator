import { useEffect, useRef, useState } from 'react';
import { W, H, X0, X1, AXIS_Y, R0, clamp } from './geom.js';
import { SHAPES, shapePath, sampleTarget } from './shapes.js';
import { createState, step, TOOLS } from './engine.js';
import { draw } from './render.js';
import { SoundEngine } from './audio.js';

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const STATUS_LABEL = {
  IDLE: '● Idle',
  CUTTING: '✂ Cutting',
  CHATTER: '⚠ Chatter — speed up the spindle!',
  DONE: '✓ Complete',
  CRACKED: '✖ Cracked — too thin',
  DISPLAY: '✨ On display',
};

const snap = (s) => ({
  rpm: s.rpm,
  shape: s.shapeId,
  tool: s.tool.type,
  auto: s.tool.auto,
  match: s.match,
  removedPct: s.initialVol ? (s.removedVol / s.initialVol) * 100 : 0,
  status: s.status,
  done: s.done,
  polished: s.polished,
  cracked: s.cracked,
  t: s.t,
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
    if (ui.done && !prevDone.current) setBannerDismissed(false);
    prevDone.current = ui.done;
  }, [ui.done]);

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
      s.tool.engaged = s.tool.auto || pointerRef.current.down || btnRef.current || keysRef.current.has(' ');
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
    };
    const ku = (e) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
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
    s.polished = false;
    s.cracked = false;
    s.warnedThin = false;
    if (id === 'free') s.tool.auto = false;
    setUi((u) => ({ ...u, shape: id, done: false, polished: false, cracked: false, auto: s.tool.auto }));
    setBannerDismissed(false);
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
    if (s.shapeId === 'free') return;
    s.tool.auto = !s.tool.auto;
    if (s.tool.auto) {
      s.done = false;
      s.polished = false;
    }
    setUi((u) => ({ ...u, auto: s.tool.auto, done: s.tool.auto ? false : u.done }));
  };

  const reset = () => {
    const cur = stateRef.current;
    const s = createState(cur.shapeId, cur.rpm);
    s.tool.type = cur.tool.type;
    stateRef.current = s;
    setBannerDismissed(false);
    setUi((u) => ({ ...u, ...snap(s) }));
  };

  const polish = () => {
    const s = stateRef.current;
    s.polished = true;
    s.rpm = 0;
    s.tool.auto = false;
    setUi((u) => ({ ...u, polished: true, rpm: 0, auto: false }));
  };

  const savePng = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement('a');
    a.download = `lathe-${stateRef.current.shapeId}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };

  const shapeName = SHAPES.find((sh) => sh.id === ui.shape);

  return (
    <div className="app">
      <header>
        <div>
          <h1>🪵 Wood Lathe Simulator</h1>
          <p className="sub">
            Rough the spinning blank down to the target profile. Mind the RPM, feed rate and cut
            depth — just like a real lathe, you can't put wood back once it's gone.
          </p>
        </div>
        <button className={`btn ghost ${ui.sound ? 'on' : ''}`} onClick={toggleSound}>
          {ui.sound ? '🔊 Sound on' : '🔇 Sound off'}
        </button>
      </header>

      <div className="layout">
        <div className="stage">
          <div className="canvas-wrap">
          <div className="target-chip">
            {ui.shape === 'free'
              ? '✋ Freeform — shape it your way'
              : `Target: ${shapeName.emoji} ${shapeName.name}`}
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

          {ui.done && !bannerDismissed && (
            <div className="overlay">
              <div className="card overlay-card">
                <div className="big">🏆</div>
                <h2>Turning complete!</h2>
                <p>
                  Match {ui.match.toFixed(1)}% · material removed {ui.removedPct.toFixed(1)}% ·
                  time {fmt(ui.t)}
                  {ui.cracked ? ' · (with a crack — ouch)' : ''}
                </p>
                <div className="row">
                  <button className="btn primary" onClick={polish}>✨ Polish &amp; display</button>
                  <button className="btn ghost" onClick={savePng}>💾 Save PNG</button>
                  <button className="btn ghost" onClick={reset}>↺ New blank</button>
                </div>
                <button className="linklike" onClick={() => setBannerDismissed(true)}>
                  keep turning
                </button>
              </div>
            </div>
          )}

          {ui.polished && (
            <div className="finish-chip">
              <button className="btn ghost" onClick={savePng}>💾 Save PNG</button>
              <button className="btn ghost" onClick={reset}>↺ New blank</button>
            </div>
          )}

          {coarse && !ui.polished && (
            <button
              className="cut-btn"
              onPointerDown={cutDown}
              onPointerUp={cutUp}
              onPointerCancel={cutUp}
              onPointerLeave={cutUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              ✂<span>CUT</span>
            </button>
          )}
          </div>

          <div className="legend">
            <span><i className="dot need" /> more to cut</span>
            <span><i className="dot on" /> on target</span>
            <span><i className="dot over" /> overcut — wood gone</span>
            {coarse ? (
              <span className="keys">👆 drag on the wood to carve · hold CUT to press</span>
            ) : (
              <span className="keys">🖱 drag to cut · ← → feed · ↑ ↓ lift · SPACE press</span>
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
            {ui.rpm > 0 && ui.rpm < 700 && <div className="warn">⚠ Low speed — risk of chatter marks</div>}
            {ui.rpm === 0 && <div className="warn off">Spindle stopped</div>}
          </div>

          <div className="card actions">
            <button
              className={`btn ${ui.auto ? 'primary' : ''}`}
              onClick={toggleAuto}
              disabled={ui.shape === 'free'}
              title={ui.shape === 'free' ? 'Pick a target shape first' : 'Watch the lathe turn the piece by itself'}
            >
              {ui.auto ? '⏸ Stop auto-turn' : '▶ Auto-turn (demo)'}
            </button>
            <button className="btn ghost" onClick={reset}>↺ New blank</button>
          </div>

          <div className="card">
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
          </div>
        </aside>
      </div>

      <footer className="tips">
        <b>Tips:</b> higher RPM allows deeper, safer cuts · feed slowly — fast, deep passes tear
        the wood out · the green edge means you're on target, orange means keep cutting, red means
        you've cut past the target (it can't be fixed) · not sure where to start? Hit
        <b> Auto-turn</b> and watch a full pass.
      </footer>
    </div>
  );
}
