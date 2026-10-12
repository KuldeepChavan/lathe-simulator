// Shared geometry constants for the lathe scene (world units = canvas px)
export const W = 960;
export const H = 560;

export const N = 281;          // profile resolution
export const X0 = 176;         // blank left end (chuck)
export const X1 = 728;         // blank right end (tailstock center)
export const AXIS_Y = 300;     // spindle axis height
export const R0 = 78;          // blank radius
export const CLAMP = 4;        // uncuttable points at each end (held by chuck/center)
export const RAIL_Y = 394;     // tool rest rail height

export const BX = (i) => X0 + (i / (N - 1)) * (X1 - X0);
export const DX = (X1 - X0) / (N - 1);

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
