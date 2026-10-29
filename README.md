# 🪵 Wood Lathe Simulator

A realistic wood-turning lathe simulator built with React + Canvas 2D (no 3D libraries, 60 fps).

## Run it

```bash
npm install
npm run dev      # dev server (http://localhost:5173)
npm run build    # production build
```

## How to play

1. Pick a **wood species** — each has its own color, grain, density and turning behavior.
2. Pick a **target shape** (vase, bowl, bottle, tumbler, mushroom, chess pawn, stool, candle, goblet, finial, hourglass) or **Freeform** to sculpt anything.
3. Move the cutting tool over the wood with the mouse (or arrow keys).
4. **Hold the left mouse button** (or hold **SPACE**) to press the tool into the spinning blank.
5. Cut the blank down to the dashed cyan target line:
   - 🟠 orange edge = more material to remove
   - 🟢 green edge = on target
   - 🔴 red edge = overcut (wood is gone — it can't be put back)
6. Hit **96.5%+ match** to complete the turn, then finish the piece:
   - **Sand** it down the grit ladder (80 → 120 → 220 → 400) to kill chatter marks and scratches
   - **Apply oil** once the surface reads smooth enough — the wood darkens and the grain opens up
   - **Finish & Display** for a graded (S–D) showcase, or **Save PNG**

## Controls

| Input | Action |
| --- | --- |
| Mouse move | position the tool (along axis / radial) |
| Hold left click | press the tool into the wood (cut) |
| ← → | feed the tool along the axis |
| ↑ ↓ | raise / lower the tool |
| Hold SPACE | press the tool |
| **H** | hone the tool edge (restores a dull edge) |
| **S** | toggle the sander (finishing stage; drag to scrub) |
| RPM slider | spindle speed (0 = spindle stop) |
| **Touch**: drag on the wood | position + press the tool (tip aims above your finger) |
| **Touch**: hold ✂ CUT button | press the tool (combine with a drag to feed) |

## Realism model

- **Species physics** — density drives chatter threshold, cut rate, tear-out safety and tool wear: soft cherry chatters easily and cuts fast, hard maple is steady but dulls the edge quickly.
- **RPM-dependent cut rate** — material removal scales with spindle speed.
- **Chatter** — cutting below the species' threshold leaves scalloped marks and rattles the tool.
- **Tool edge wear & honing** — every cut dulls the edge; a dull edge cuts poorly and **leaves scorch marks** in the wood. Hone it (H) to restore a sharp edge.
- **Tear-outs** — deep cuts at low speed can rip chunks out of the wood.
- **Thin-wall blowouts** — cut the wall too thin and the piece cracks.
- **Finishing pipeline** — sanding does real geometry work: it smooths chatter ripples out of the profile and fades scorch marks, grit by grit. The surface meter (Rough → Bumpy → Smooth → Glass) gates oiling. Oil lerps the palette to the finished tone.
- **Grading & gallery** — the display grade blends shape match, overcut, surface finish and turn time into an S–A–B–C–D score. Your best piece is remembered in the header (localStorage).
- **Tool selection** — gouge (wide, fast), skew chisel (fine), parting tool (thin walls, deep grooves).
- **Shavings, dust and chips** fly off the cutting edge; a handwheel and drive-sleeve marker show true spindle speed.
- **Procedural audio** — motor hum, cut noise, chatter rattle, honing hiss, oiling, burn thumps, chips and cracks (toggle in the header).
- **Auto-turn** — press ▶ to watch a full pass turn the piece by itself.

## Files

- `src/geom.js` — scene constants
- `src/shapes.js` — target profiles (Catmull-Rom splines), blank generation, thumbnails
- `src/species.js` — wood species (palette, grain, density, hardness)
- `src/engine.js` — physics: species cutting, wear/honing, scorch, sanding, scoring, particles
- `src/render.js` — canvas renderer: lathe, rotating grain, scorch, sander/honing visuals, display spotlight
- `src/audio.js` — procedural Web Audio engine
- `src/App.jsx` — React UI + game loop
