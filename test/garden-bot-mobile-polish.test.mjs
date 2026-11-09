import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=x=>readFileSync(x,"utf8");
const preview=read("public/battle/garden-bot-preview/index.html");
const original=read("public/battle/index.html");
const polish=read("public/battle/assets/garden-bot-preview-mobile-polish.css");
const game=read("public/battle/assets/garden-bot-same-origin-preview.js");

test("mobile polish is available only on NFTree's Garden Bot test route",()=>{
  assert.match(preview,/garden-bot-preview-mobile-polish\.css/);
  assert.doesNotMatch(original,/garden-bot-preview-mobile-polish\.css/);
  assert.match(original,/index-BKkC2woN\.js/);
  assert.doesNotMatch(original,/garden-bot-same-origin-preview\.js/);
});
test("mobile battle keeps five-card stage while shortening redundant controls",()=>{
  assert.match(polish,/max-width: 640px/);
  assert.match(polish,/\.gb-battle-options:has\(> \.gb-move-card-grid > \.gb-battle-move-card\)/);
  assert.match(polish,/gb-free-bot-reroll/);
  assert.match(polish,/min-height: 44px/);
  assert.match(polish,/gb-last-opponent-move-copy/);
});
test("result/share panel is compact without changing wallet transactions or NFT identity",()=>{
  assert.match(polish,/gb-result-modal-backdrop/);
  assert.match(polish,/gb-result-modal-visual/);
  assert.match(polish,/gb-result-share-primary/);
  assert.match(game,/startBotBattle:xu/);
  assert.match(game,/create_ranked_bot_battle_v2_with_fifth_move/);
  assert.match(game,/Reroll blocked:/);
  assert.match(game,/function HY\(/);
});
