import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=p=>readFileSync(p,"utf8");
const liveHtml=read("public/battle/index.html");
const liveJs=read("public/battle/assets/index-tree-lock-v16.js");
const preview=read("public/battle/assets/garden-bot-same-origin-preview.js");
const polish=read("public/battle/assets/garden-bot-preview-mobile-polish.css");
const page=read("public/battle/garden-bot-preview/index.html");

test("preview-only bonus inspection preserves actual Garden Bot signing handlers",()=>{
  assert.match(page,/garden-bot-same-origin-preview\.js/);
  assert.match(preview,/\[previewBonusDetails,setPreviewBonusDetails\]=p\.useState\(null\)/);
  assert.match(preview,/onClick:\(\)=>setPreviewBonusDetails\(I\)/);
  assert.match(preview,/role:"dialog","aria-modal":!0,"aria-label":"Bonus card details"/);
  assert.match(preview,/sn\[previewBonusDetails\]\?\.effect/);
  assert.match(preview,/onClick:\(\)=>\{_l\(previewBonusDetails\),setPreviewBonusDetails\(null\)\}/);
  assert.match(preview,/create_ranked_bot_battle_v2_with_fifth_move/);
  assert.match(preview,/startBotBattle:xu/);
  assert.match(preview,/Reroll blocked:/);
  assert.match(preview,/\[y,v\]=p\.useState\(H\.RANDOM_OBJECT_CANDIDATES\[0\]\)/);
});

test("forfeit requires explicit confirmation, then calls original handler",()=>{
  assert.match(preview,/className:"gb-match-options-disclosure"/);
  assert.match(preview,/onClick:\(\)=>setForfeitConfirm\(!0\)/);
  assert.match(preview,/role:"dialog","aria-modal":!0,"aria-label":"Confirm forfeit"/);
  assert.match(preview,/onClick:\(\)=>\{setForfeitConfirm\(!1\),iP\(\)\}/);
  assert.match(preview,/onClick:\(\)=>setForfeitConfirm\(!1\)/);
  assert.match(preview,/document\.addEventListener\("keydown",I\)/);
});

test("mobile Step 1 is concise and full card effect is in a scroll-safe modal",()=>{
  assert.match(preview,/Tap a TREE Power card to read its full effect/);
  assert.match(polish,/\.gb-battle-page-active \.gb-battle-options > \.gb-fifth-picker > p \{[\s\S]*?display: none !important;/);
  assert.match(polish,/gb-bonus-detail-effect/);
  assert.match(polish,/gb-bonus-detail-actions/);
  assert.match(polish,/gb-forfeit-confirm-actions/);
  assert.match(polish,/min-height: 48px/);
});

test("regular Garden Battles pages are unchanged",()=>{
  assert.match(liveHtml,/src="\/battle\/assets\/index-tree-lock-v16\.js"/);
  assert.doesNotMatch(liveHtml,/garden-bot-same-origin-preview\.js/);
  assert.doesNotMatch(liveHtml,/garden-bot-preview-mobile-polish\.css/);
  assert.match(liveJs,/\[y,v\]=p\.useState\(null\)/);
});
