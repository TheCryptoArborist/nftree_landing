import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=p=>readFileSync(p,"utf8");
const preview=read("public/battle/garden-bot-preview/index.html");
const prod=read("public/battle/index.html");
const css=read("public/battle/assets/garden-bot-preview-compact-game.css");
const bundle=read("public/battle/assets/garden-bot-same-origin-preview.js");

test("only test page imports the compact battle layout",()=>{
  assert.match(preview,/garden-bot-preview-compact-game\.css/);
  assert.doesNotMatch(prod,/garden-bot-preview-compact-game\.css/);
  assert.match(prod,/index-tree-lock-v16\.js/);
  assert.doesNotMatch(prod,/garden-bot-same-origin-preview\.js/);
});

test("compact game applies only to active mobile battles and retains all click handlers",()=>{
  assert.match(css,/max-width: 640px/);
  assert.match(css,/gb-battle-page-active/);
  assert.match(css,/gb-battle-hud-center/);
  assert.match(css,/gb-battle-options/);
  assert.match(css,/gb-battle-arena/);
  assert.match(css,/gb-move-card-grid/);
  assert.match(css,/gb-battle-move-card-fifth/);
  assert.match(css,/min-height: 62px/);
  assert.match(css,/overscroll-behavior-y: contain/);
  assert.match(bundle,/startBotBattle:xu/);
  assert.match(bundle,/create_ranked_bot_battle_v2_with_fifth_move/);
  assert.match(bundle,/Reroll blocked:/);
  assert.match(bundle,/\[y,v\]=p\.useState\(H\.RANDOM_OBJECT_CANDIDATES\[0\]\)/);
});

test("preview path keeps same-origin assets and fifth card onboarding",()=>{
  assert.match(preview,/src="\/battle\/assets\/garden-bot-same-origin-preview\.js\?v=tree-lock-v16"/);
  assert.match(preview,/garden-bot-preview-onboarding\.css/);
  assert.match(bundle,/Tap a TREE Power card to read its full effect/);
  assert.match(bundle,/Your Bonus Fifth Move/);
});
