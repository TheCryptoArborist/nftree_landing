import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TREE_RANK_SOURCES, formatTreeRankSource } from "../public/battle/assets/garden-bot-tree-rank-sources.js";

const read = (file) => readFileSync(file, "utf8");
const preview = read("public/battle/assets/garden-bot-same-origin-preview.js");
const html = read("public/battle/garden-bot-preview/index.html");
const liveHtml = read("public/battle/index.html");
const liveBundle = read("public/battle/assets/index-BKkC2woN.js");

test("three status sources match the active Railway eligibility provider", () => {
  assert.deepEqual(TREE_RANK_SOURCES.map(x => x.id), ["suidex-v2", "suidex-v3", "tree-lock"]);
  assert.deepEqual(TREE_RANK_SOURCES.map(x => x.label), ["V2 LP", "V3 LP", "TREE Lock"]);
  assert.equal(TREE_RANK_SOURCES.some(x => x.id === "moonbags-staking"), false);
});

test("read-only TREE source statuses preserve verified balances, zero and failures", () => {
  assert.deepEqual(formatTreeRankSource({status:"qualified-data",underlyingTreeDisplay:"108063173.066137"},"qualified"),{
    status:"qualified-data",value:"108063173.066137 TREE"
  });
  assert.deepEqual(formatTreeRankSource({status:"qualified-data",underlyingTreeDisplay:" 0.5 "},"qualified"),{
    status:"qualified-data",value:"0.5 TREE"
  });
  assert.deepEqual(formatTreeRankSource({status:"verified-zero",underlyingTreeDisplay:"500"},"qualified"),{
    status:"verified-zero",value:"0 TREE"
  });
  assert.deepEqual(formatTreeRankSource({status:"unavailable",reason:"rpc_timeout"},"qualified"),{
    status:"unavailable",value:"Unavailable"
  });
  assert.deepEqual(formatTreeRankSource({status:"qualified-data"},"qualified"),{
    status:"qualified-data",value:"Verified (amount unavailable)"
  });
});

test("missing source is pending only before eligibility query has resolved", () => {
  assert.deepEqual(formatTreeRankSource(undefined,"checking"),{status:"checking",value:"Checking…"});
  assert.deepEqual(formatTreeRankSource(undefined,"qualified"),{status:"not-reported",value:"Not reported"});
  assert.deepEqual(formatTreeRankSource(undefined,"not-qualified"),{status:"not-reported",value:"Not reported"});
  assert.deepEqual(formatTreeRankSource(undefined,"verification-incomplete"),{status:"not-reported",value:"Not reported"});
  assert.deepEqual(formatTreeRankSource(undefined,"unavailable"),{status:"unavailable",value:"Unavailable"});
  assert.deepEqual(formatTreeRankSource({status:"unknown"},"qualified"),{status:"not-reported",value:"Not reported"});
});

test("preview React bundle consumes shared helper and supports active tree-lock source", () => {
  assert.match(preview,/import\{TREE_RANK_SOURCES as rankSourceDefinitions,formatTreeRankSource as formatRankSource\}/);
  assert.match(preview,/f=rankSourceDefinitions/);
  assert.match(preview,/formatRankSource\(u\.get\(y\.id\),n\.status\)/);
  assert.match(preview,/function R2\(e\)\{return e==="suidex-v2"\|\|e==="suidex-v3"\|\|e==="tree-lock"\}/);
  assert.match(preview,/Qualifying LP \+ TREE Lock/);
  assert.doesNotMatch(preview,/"moonbags-staking"/);
  assert.match(preview,/create_ranked_bot_battle_v2_with_fifth_move/);
  assert.match(preview,/startBotBattle:xu/);
});

test("existing regular Garden Battles site and signing remain untouched", () => {
  assert.match(liveHtml,/src="\/battle\/assets\/index-BKkC2woN\.js"/);
  assert.doesNotMatch(liveHtml,/garden-bot-tree-rank-sources/);
  assert.doesNotMatch(liveBundle,/garden-bot-tree-rank-sources/);
  assert.match(html,/src="\/battle\/assets\/garden-bot-same-origin-preview\.js"/);
  assert.match(preview,/\[y,v\]=p\.useState\(H\.RANDOM_OBJECT_CANDIDATES\[0\]\)/);
});
