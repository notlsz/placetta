/* The 404 whale: a blue whale rendered as ASCII every frame. A side profile is shaded by light from the surface,
   mottled like real blue-whale skin, with throat pleats, a long flipper and flukes that beat; the body bends with the
   stroke. Exported as window.WhaleASCII.frame(t, cols, rows) -> string. */
(() => {
  const RAMP = " .,:;-~=+*#%@";
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // cheap value noise for the mottled skin
  const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  };

  /* body, in lengths: X runs 0 (snout) to 1 (fluke tips); Y down is positive */
  const half = X => {
    if (X < 0 || X > 0.88) return 0;
    if (X < 0.32) return 0.122 * Math.pow(1 - Math.pow(1 - X / 0.32, 2.4), 0.5);
    if (X < 0.44) return 0.122;
    return 0.018 + 0.104 * Math.pow(Math.cos((Math.PI / 2) * clamp((X - 0.44) / 0.44, 0, 1)), 1.15);
  };
  const W = 2.1; // tail beats per ~3 s
  const bend = (X, t) => { const w = Math.pow(Math.max(0, (X - 0.32) / 0.68), 2); return 0.035 * w * Math.sin(W * t - 5.2 * X); };
  const centre = (X, t) => 0.016 * (1 - clamp(X / 0.3, 0, 1)) - 0.006 * Math.sin(Math.PI * clamp(X, 0, 1)) + bend(X, t);

  function frame(t, cols, rows) {
    const G = new Float32Array(rows * cols).fill(-1);
    const tilt = -0.09 + 0.015 * Math.sin(t * 0.35), tc = Math.cos(tilt), ts = Math.sin(tilt);
    const aspect = 0.6;                       // a cell is 0.6 as wide as it is tall
    const L = cols * aspect * 0.86;          // whale length in row units, leaving room for the flukes
    const x0 = cols * 0.05, y0 = rows * 0.42;
    const pedX = 0.86, pedY = centre(pedX, t), slope = (centre(pedX + 0.01, t) - centre(pedX - 0.01, t)) / 0.02;
    const ang = Math.atan(slope) * 0.3, ca = Math.cos(ang), sa = Math.sin(ang);
    const finA = 0.35 + 0.12 * Math.sin(W * t * 0.5 + 1.2), fca = Math.cos(finA), fsa = Math.sin(finA);
    const caus = (X, Y) => Math.pow(Math.max(0, Math.sin(X * 38 + t * 1.3) * Math.sin(X * 17 - Y * 30 - t * 0.9)), 3);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const X0 = (c - x0) * aspect / L - 0.5, Y0 = (r - y0) / L;
        const X = X0 * tc - Y0 * ts + 0.5, Y = X0 * ts + Y0 * tc;
        let lum = -1;

        // body
        const H = half(X);
        if (H > 0) {
          const C = centre(X, t), v = (Y - C) / H;
          if (v >= -1 && v <= 1) {
            const nz = Math.sqrt(1 - v * v);
            lum = 0.04 + 0.78 * Math.pow(Math.max(0, -0.6 * v + 0.55 * nz), 1.35) + 0.3 * Math.pow(Math.max(0, -v), 8);
            lum += (noise(X * 45, Y * 70) - 0.5) * 0.22 * nz;                 // mottling
            if (v < 0) lum += 0.35 * caus(X, Y) * (1 + v * 0.3);         // light from the surface on the back
            if (v > 0.15 && X > 0.03 && X < 0.47) {                        // throat pleats
              const mouth = C + 0.022 + 0.05 * Math.pow(clamp(X / 0.2, 0, 1), 2);
              if (Y > mouth && Math.abs(((Y - mouth) * L / 1.0) % 2 - 1) > 0.55) lum *= 0.5;
            }
            if (X < 0.2) {                                                  // the long mouth line
              const mouth = C + 0.022 + 0.05 * Math.pow(X / 0.2, 2);
              if (Math.abs(Y - mouth) * L < 0.55) lum = 0.02;
            }
            if (v > 0.82) lum *= 0.55;                                      // belly in shadow
            lum = Math.max(lum, 0.1);
          }
        }

        // splash guard / blowhole, dorsal fin
        const bh = Math.hypot((X - 0.19) * 30, (Y - (centre(0.19, t) - half(0.19))) * 60);
        if (bh < 0.6) lum = Math.max(lum, 0.55);
        {
          const dx = (X - 0.74) / 0.05;
          if (dx > 0 && dx < 1) {
            const top = centre(X, t) - half(X), hgt = 0.024 * Math.sin(Math.PI * Math.pow(dx, 0.7)) * (1 - dx * 0.4);
            if (Y < top + 0.002 && Y > top - hgt) lum = Math.max(lum, 0.72);
          }
        }

        // pectoral flipper: a long blade from below the chest, angled back
        {
          const ax = 0.27, ay = centre(ax, t) + half(ax) * 0.55;
          const px = (X - ax), py = (Y - ay);
          const u = px * fca + py * fsa, w = -px * fsa + py * fca;     // along / across the blade
          const len = 0.17;
          if (u > 0 && u < len) {
            const wid = 0.024 * Math.pow(1 - u / len, 0.7) * Math.pow(Math.min(1, u / 0.012), 0.5);
            if (Math.abs(w) < wid) lum = Math.max(lum, 0.42 + 0.5 * (1 - (w / wid + 1) / 2));
          }
        }

        // flukes, seen edge-on from the side: a long blade that whips with the stroke and shows a little of its
        // face at the top and bottom of each beat
        {
          const ph = W * t - 5.2 * pedX;
          const px = X - pedX, py = Y - pedY;
          const sx = (px * ca + py * sa) / 0.15;
          if (sx > -0.03 && sx < 1) {
            const k = clamp(sx, 0, 1);
            const yc = 0.03 * k * k * Math.sin(ph - 0.9);                       // the blade bends behind the stroke
            const th = (0.007 + 0.022 * Math.abs(Math.sin(ph - 0.9))) * Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.05 + 0.04)), 0.65) + 0.012 * (1 - k) ** 3;
            const yy = (-px * sa + py * ca) - yc;
            if (Math.abs(yy) < th) {
              const e = 1 - Math.abs(yy) / th;
              lum = Math.max(lum, 0.35 + 0.45 * e * (yy < 0 ? 1 : 0.7) + 0.2 * caus(X, Y));
            }
          }
        }

        // eye
        const ex = (X - 0.105) * L / aspect, ey = (Y - (centre(0.105, t) + 0.016)) * L;
        if (Math.abs(ey) < 0.5 && Math.abs(ex) < 1.5) lum = Math.abs(ex) < 0.5 ? -3 : -2;
        G[r * cols + c] = lum;
      }
    }

    // a rim of light along the back, a crisp line along the belly
    const out = new Array(rows);
    for (let r = 0; r < rows; r++) {
      let line = "";
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c, g = G[i];
        if (g === -3) { line += "o"; continue; }
        if (g < 0) { line += " "; continue; }
        const up = r > 0 ? G[i - cols] : -1, dn = r < rows - 1 ? G[i + cols] : -1;
        if (up === -1) { line += RAMP[1 + Math.round(clamp(g + 0.14, 0, 1) * (RAMP.length - 2))]; continue; }
        if (dn === -1) { line += c % 2 ? "'" : "`"; continue; }
        line += RAMP[1 + Math.round(clamp(g, 0, 1) * (RAMP.length - 2))];
      }
      out[r] = line;
    }

    // where the blowhole is, in cells, for the bubbles
    const bx0 = 0.19 - 0.5, by0 = centre(0.19, t) - half(0.19);
    const blow = { c: x0 + (bx0 * tc + by0 * ts + 0.5) * L / aspect, r: y0 + (-bx0 * ts + by0 * tc) * L };
    return { text: out.join("\n"), blow };
  }
  window.WhaleASCII = { frame };
})();
