#!/usr/bin/env node
// POC (throwaway): prove the Option-3 "Variant B" hole compositing works in Obsidian's real Chromium.
//
// Question under test: can a body-level portal with a clip-path HOLE sit ABOVE the editor, reveal an
// in-host (contain:paint'd) opaque "cut" THROUGH the hole, paint a dim "Veil-Rand" that OVERFLOWS the
// host box, and keep the hole AXIS-ALIGNED while the inner image content ROTATES?
//
// Synthetic scene (not the real CM6 widget — but the exact CSS compositing the rework relies on):
//   host  : position:fixed, contain:paint, overflow:hidden, z=1  → green cut inside (= in-host Schnitt)
//   portal: position:fixed, z=9999, solid purple (= Veil-Rand), clip-path hole exactly over the cut
//   marker: yellow bar, child of portal (so clipped by the hole), transform:rotate(θ) (= image content)
//
// Run: node tests/cdp/poc-portal-hole.mjs   (needs the dev build + Obsidian with the CDP relay)

import { connectOptical, pixel, near } from "./_optical.mjs";

const GREEN = [40, 200, 80];   // the in-host cut (must show through the hole)
const PURPLE = [60, 20, 90];   // the Veil-Rand (portal background)
const YELLOW = [255, 220, 0];  // the rotating marker (image-content stand-in)

// Scene geometry (viewport px).
const HOST = { x: 400, y: 250, w: 200, h: 150 };
const WRAP = { x: 300, y: 180, w: 400, h: 290 };
// Hole in wrapper-local px (== HOST in viewport).
const L = HOST.x - WRAP.x, T = HOST.y - WRAP.y, R = L + HOST.w, B = T + HOST.h;
const { w: W, h: H } = WRAP;

const clip = [
  `evenodd`,
  `0 0`, `${W}px 0`, `${W}px ${H}px`,
  `${L}px ${H}px`, `${L}px ${T}px`, `${R}px ${T}px`, `${R}px ${B}px`, `${L}px ${B}px`, `${L}px ${H}px`,
  `0 ${H}px`,
].join(", ");

const buildExpr = (theta) => `(() => {
  const D = document;
  D.querySelectorAll(".poc-portal-node").forEach((n) => n.remove());
  const host = D.createElement("div");
  host.className = "poc-portal-node";
  host.style.cssText = "position:fixed;left:${HOST.x}px;top:${HOST.y}px;width:${HOST.w}px;height:${HOST.h}px;z-index:1;contain:paint;overflow:hidden;";
  const cut = D.createElement("div");
  cut.style.cssText = "position:absolute;inset:0;background:rgb(40,200,80);";
  host.appendChild(cut);
  D.body.appendChild(host);
  const wrap = D.createElement("div");
  wrap.className = "poc-portal-node";
  wrap.style.cssText = "position:fixed;left:${WRAP.x}px;top:${WRAP.y}px;width:${W}px;height:${H}px;z-index:9999;background:rgb(60,20,90);overflow:hidden;clip-path:polygon(${clip});";
  const mark = D.createElement("div");
  mark.style.cssText = "position:absolute;left:50%;top:50%;width:700px;height:24px;background:rgb(255,220,0);transform:translate(-50%,-50%) rotate(${theta}deg);";
  wrap.appendChild(mark);
  D.body.appendChild(wrap);
  return true;
})()`;

const cleanupExpr = `(() => { document.querySelectorAll(".poc-portal-node").forEach((n) => n.remove()); return true; })()`;

let failures = 0;
function check(label, got, want, expectMatch = true) {
  const isNear = near(got, want, 70);
  const ok = isNear === expectMatch;
  if (!ok) failures++;
  const rel = expectMatch ? "==" : "!=";
  console.log(`${ok ? "  PASS" : "✗ FAIL"}  ${label}  got rgb(${got.slice(0, 3).join(",")}) ${rel} expect`);
}

async function shotChecks(opt, theta) {
  await opt.evaluate(buildExpr(theta));
  await new Promise((r) => setTimeout(r, 250));
  const img = await opt.screenshot({ x: WRAP.x, y: WRAP.y, width: WRAP.w, height: WRAP.h });
  const px = (vx, vy) => pixel(img, vx - WRAP.x, vy - WRAP.y);
  console.log(`\n— θ=${theta}° —`);

  // 1. hole center → green (in-host cut shows THROUGH the body-portal hole)
  check("hole center shows in-host cut", px(HOST.x + HOST.w / 2, HOST.y + HOST.h / 2), GREEN);

  // 2. Veil-Rand OVERFLOWS the host box (above it / beside it, inside the portal) → purple. Sampled
  //    OFF the marker's through-centre line so the legitimately-painted yellow bar doesn't land here.
  check("veil paints above host box (overflow)", px(HOST.x + HOST.w / 2, HOST.y - 35), PURPLE);
  check("veil left band overflows host box", px(HOST.x - 50, HOST.y + 20), PURPLE);

  // 3. hole boundary AXIS-ALIGNED & INVARIANT under inner rotation: just-inside the 4 hole corners →
  //    the cut (green) at every θ; just-outside (along an axis) → NOT the cut (veil OR the rotating
  //    marker — anything but green). The "not green outside / green inside, identical at θ=0 and θ=40"
  //    is the whole proof: the hole reveals the cut and does NOT move when the inner content rotates.
  const inset = 7;
  const corners = [
    ["TL", HOST.x, HOST.y, +1, +1], ["TR", HOST.x + HOST.w, HOST.y, -1, +1],
    ["BL", HOST.x, HOST.y + HOST.h, +1, -1], ["BR", HOST.x + HOST.w, HOST.y + HOST.h, -1, -1],
  ];
  for (const [name, cx, cy, sx, sy] of corners) {
    check(`hole ${name} just-inside = cut`, px(cx + sx * inset, cy + sy * inset), GREEN);
    check(`hole ${name} just-outside-x ≠ cut`, px(cx - sx * inset, cy + sy * inset), GREEN, false);
    check(`hole ${name} just-outside-y ≠ cut`, px(cx + sx * inset, cy - sy * inset), GREEN, false);
  }
  return px;
}

(async () => {
  const opt = await connectOptical();
  try {
    // θ=0: the marker bar lies on the wrapper centerline → confirm it's actually painted in the veil.
    const px0 = await shotChecks(opt, 0);
    check("marker bar present at θ=0 (left band, centerline)", px0(WRAP.x + 45, WRAP.y + WRAP.h / 2), YELLOW);

    // θ=40: the bar tilts AWAY from that same point → image content rotated, but the hole did NOT.
    const px40 = await shotChecks(opt, 40);
    check("marker bar moved away at θ=40 (image rotated)", px40(WRAP.x + 45, WRAP.y + WRAP.h / 2), YELLOW, false);

    console.log(`\n${failures === 0 ? "✓ ALL PASS — hole compositing works as conceived" : `✗ ${failures} FAIL`}`);
  } finally {
    await opt.evaluate(cleanupExpr).catch(() => {});
    opt.close();
  }
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(2); });
