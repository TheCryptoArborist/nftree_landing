import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=p=>readFileSync(p,"utf8");
const html=read("public/battle/garden-bot-preview/index.html");
const preview=read("public/battle/assets/garden-bot-same-origin-preview.js");
const css=read("public/battle/assets/garden-bot-preview-compact-game.css");
const liveHtml=read("public/battle/index.html");
const liveBundle=read("public/battle/assets/index-tree-lock-proof.js");

test("compact mobile layout is only loaded on Garden Bot preview",()=>{
  assert.ok(html.includes('href="/battle/assets/garden-bot-preview-compact-game.css"'));
  assert.ok(!liveHtml.includes("garden-bot-preview-compact-game.css"));
  assert.ok(liveHtml.includes('src="/battle/assets/index-tree-lock-proof.js"'));
  assert.ok(liveBundle.includes('[y,v]=p.useState(null)'));
  assert.ok(preview.includes('path:"/battle/garden-bot-preview"'));
  assert.ok(preview.includes('[y,v]=p.useState(H.RANDOM_OBJECT_CANDIDATES[0])'));
});
test("CSS gates viewport layout to active Garden Bot preview on phones",()=>{
  assert.ok(css.includes("@media screen and (max-width: 640px)"));
  assert.ok(css.includes(".gb-battle-page.gb-battle-page-active:has(.gb-battle-hud .gb-battle-options)"));
  assert.ok(css.includes("height: 100dvh"));
  assert.ok(css.includes("overflow: hidden !important"));
  assert.ok(css.includes("grid-template-rows: auto auto minmax(0, 1fr)"));
  assert.ok(css.includes("overflow-y: auto"));
  assert.ok(css.includes(".gb-battle-move-card-fifth"));
  assert.ok(css.includes("grid-column: 1 / -1 !important"));
  assert.ok(css.includes("min-height: 62px !important"));
  assert.ok(css.includes(".gb-fifth-picker"));
});
test("preview retains actual fifth-card transaction and 39-card machinery",()=>{
  assert.ok(preview.includes("create_ranked_bot_battle_v2_with_fifth_move"));
  assert.ok(preview.includes('"Choose your first playing card"'));
  assert.ok(preview.includes('"View bonus card choices ↓"'));
  assert.ok(preview.includes("Reroll blocked:"));
  assert.ok(preview.includes("Fifth Move"));
});
