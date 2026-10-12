# 🪵 Wood Lathe Simulator

A realistic wood-turning lathe simulator built with React + Canvas 2D (no 3D libraries, 60 fps).

## Run it

```bash
npm install
npm run dev      # dev server (http://localhost:5173)
npm run build    # production build
```

## How to play

1. Pick a **target shape** (vase, bowl, bottle, tumbler, mushroom, chess pawn, stool, candle) or **Freeform** to sculpt anything.
2. Move the cutting tool over the wood with the mouse (or arrow keys).
3. **Hold the left mouse button** (or hold **SPACE**) to press the tool into the spinning blank.
4. Cut the blank down to the dashed cyan target line:
   - 🟠 orange edge = more material to remove
   - 🟢 green edge = on target
   - 🔴 red edge = overcut (wood is gone — it can't be put back)
5. Hit **96.5%+ match** to complete the turn, then **Polish & Display** or **Save PNG**.

## Controls

| Input | Action |
| --- | --- |
| Mouse move | position the tool (along axis / radial) |
| Hold left click | press the tool into the wood (cut) |
| ← → | feed the tool along the axis |
| ↑ ↓ | raise / lower the tool |
| Hold SPACE | press the tool |
| RPM slider | spindle speed (0 = spindle stop) |
| **Touch**: drag on the wood | position + press the tool (tip aims above your finger) |
| **Touch**: hold ✂ CUT button | press the tool (combine with a drag to feed) |

## Realism model

- **RPM-dependent cut rate** — material removal scales with spindle speed.
- **Chatter** — cutting below ~700 RPM leaves scalloped chatter marks and rattles the tool; below ~420 RPM you get warnings.
- **Tear-outs** — deep cuts at low speed can rip chunks out of the wood.
- **Thin-wall blowouts** — cut the wall below ~7 mm and the piece cracks.
- **Tool selection** — gouge (wide, fast), skew chisel (fine), parting tool (thin walls, deep grooves).
- **Shavings, dust and chips** fly off the cutting edge; a handwheel and drive-sleeve marker show true spindle speed.
- **Procedural audio** — motor hum, cut noise, chatter rattle, chips and crack (toggle in the header).
- **Auto-turn** — press ▶ to watch a full pass turn the piece by itself.

## Files

- `src/geom.js` — scene constants
- `src/shapes.js` — target profiles (Catmull-Rom splines), blank generation, thumbnails
- `src/engine.js` — physics: cutting, chatter, tear-outs, wall check, scoring, particles
- `src/render.js` — canvas renderer: lathe, rotating grain, tool, particles
- `src/audio.js` — procedural Web Audio engine
- `src/App.jsx` — React UI + game loop
