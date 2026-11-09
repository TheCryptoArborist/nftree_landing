import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const js = readFileSync("public/battle/assets/garden-bot-same-origin-preview.js", "utf8");
const css = readFileSync("public/battle/assets/garden-bot-preview-onboarding.css", "utf8");
const html = readFileSync("public/battle/garden-bot-preview/index.html", "utf8");
const live = readFileSync("public/battle/index.html", "utf8");
const liveBundle = readFileSync("public/battle/assets/index-tree-lock-proof.js", "utf8");

test("mobile Garden Bot Step 1 shows explanation, clear CTA and step 2 direction", () => {
  assert.ok(js.includes("Step 1 of 2"));
  assert.ok(js.includes("Step 2 of 2"));
  assert.ok(js.includes("Tap a TREE Power card to read its full effect"));
  assert.ok(js.includes("Your bonus and first playing card use one wallet confirmation"));
  assert.ok(js.includes("button-bonus-next-step"));
  assert.ok(js.includes("View bonus card choices ↓"));
  assert.ok(js.includes("Continue to playing cards ↓"));
  assert.ok(js.includes('lr===null?".gb-fifth-picker":".gb-move-card-grid"'));
  assert.ok(js.includes("scrollIntoView({behavior:\"smooth\",block:\"start\"})"));
});

test("mobile first-step bonus card choices are moved ahead of reroll panel", () => {
  assert.ok(css.includes("@media (max-width: 640px)"));
  assert.ok(css.includes(".gb-battle-options:has(> .gb-fifth-picker)"));
  assert.ok(css.includes("> .gb-turn-command { order: -2; }"));
  assert.ok(css.includes("> .gb-fifth-picker { order: -1; }"));
  assert.ok(css.includes("min-height: 48px"));
  assert.ok(html.includes('href="/battle/assets/garden-bot-preview-onboarding.css"'));
});

test("the actual production /battle entry is unchanged and does not load onboarding code", () => {
  assert.ok(live.includes('src="/battle/assets/index-tree-lock-proof.js"'));
  assert.ok(!live.includes("garden-bot-preview-onboarding.css"));
  assert.ok(liveBundle.includes("[y,v]=p.useState(null)"));
  assert.ok(html.includes('src="/battle/assets/garden-bot-same-origin-preview.js"'));
  assert.ok(js.includes('[y,v]=p.useState(H.RANDOM_OBJECT_CANDIDATES[0])'));
  assert.ok(js.includes("create_ranked_bot_battle_v2_with_fifth_move"));
  assert.ok(js.includes('path:"/battle/garden-bot-preview"'));
});
