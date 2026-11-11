import {beforeArcadeHandoff} from "./arcade-share-normalize.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPvpPreview } from "../scripts/pvp-mobile-patches.mjs";
const read = p => readFileSync(p, "utf8");
const original = beforeArcadeHandoff(read("public/battle/assets/index-tree-lock-v16.js"));
const preview = beforeArcadeHandoff(read("public/battle/assets/pvp-mobile-preview.js"));
function section(s, start, end) { const a=s.indexOf(start),b=s.indexOf(end,a); assert.ok(a>=0&&b>a);return s.slice(a,b); }
test("PvP preview is reproducibly generated from shipped game plus approved UI", () => {
  assert.equal(preview, buildPvpPreview(original, beforeArcadeHandoff(read("public/battle/assets/garden-bot-same-origin-preview.js"))));
});
test("entire wallet/provider, transaction construction, queue, refund and timeout handlers are byte-identical", () => {
  for (const [a,b] of [["function LK(","function _A()"],["sP=async()=>",",x1=async()=>"],["Xm=async()=>",",oP=async()=>"],["iP=async()=>",",aP=async()=>"],["aP=async()=>",",lP=async()=>"],["cP=async I=>",";p.useEffect(()=>{r!=null&&r.battleId"]]) {
    assert.equal(section(preview,a,b), section(original,a,b), a);
  }
});
test("live PvP entry stays original; isolated route includes card, terms and confirmation UI", () => {
  const entry=read("public/battle/index.html"),html=read("public/battle/pvp-preview/index.html"),css=read("public/battle/assets/pvp-mobile-preview.css");
  assert.match(entry,/index-tree-lock-v16.js/);assert.doesNotMatch(entry,/pvp-mobile-preview/);
  assert.match(html,/pvp-mobile-preview.js/);assert.match(html,/Live PvP entry fees apply/);
  assert.match(preview,/mode:"PvP Battle"/);assert.match(preview,/path:"\/battle\/pvp-preview"/);
  assert.match(preview,/onClick:\(\)=>setPreviewBonusDetails\(I\),disabled:St\|\|th/);
  assert.match(preview,/setForfeitConfirm\(!1\),iP\(\)/);
  assert.match(css,/\.gb-match-terms-details \{ display: block !important/);
  assert.match(preview,/button-queue-refund/);assert.match(preview,/Claim Timeout Win/);
});
