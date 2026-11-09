import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=p=>readFileSync(p,"utf8");
const original=read("public/battle/index.html");
const preview=read("public/battle/garden-bot-preview/index.html");
const css=read("public/battle/assets/garden-bot-preview-mobile-polish.css");
const bundle=read("public/battle/assets/garden-bot-same-origin-preview.js");

test("landing rank styles load only through the existing Garden Bot preview",()=>{
 assert.match(preview,/garden-bot-preview-mobile-polish\.css/);
 assert.doesNotMatch(original,/garden-bot-preview-mobile-polish\.css/);
 assert.match(original,/src="\/battle\/assets\/index-tree-lock-proof\.js"/);
 assert.match(preview,/src="\/battle\/assets\/garden-bot-same-origin-preview\.js"/);
});
test("mobile rank cards stack and size rank text for readability",()=>{
 assert.match(css,/\.gb-player-status-strip \.gb-player-profile-content \{/);
 assert.match(css,/grid-template-columns: minmax\(0, 1fr\) !important/);
 assert.match(css,/gb-tree-status-qualifying/);
 assert.match(css,/font-size: clamp\(16px, 4\.6vw, 20px\)/);
 assert.match(css,/\.gb-player-status-strip:not\(\[data-expanded="true"\]\) \.gb-tree-status-sources/);
 assert.match(css,/\.gb-player-status-strip\[data-expanded="true"\] \.gb-tree-status-sources/);
 assert.match(css,/grid-template-columns: minmax\(74px, 100px\) minmax\(0, 1fr\)/);
});
test("rank UI changes do not touch TREE eligibility or Garden Bot transaction",()=>{
 assert.match(bundle,/create_ranked_bot_battle_v2_with_fifth_move/);
 assert.match(bundle,/startBotBattle:xu/);
 assert.match(bundle,/gb-tree-status-card/);
});
