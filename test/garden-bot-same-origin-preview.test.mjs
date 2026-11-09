import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { verifyGardenBattlesBundle } from "../scripts/verify-garden-battles-release.mjs";

const root = process.cwd();
const read = p => readFileSync(path.join(root, p), "utf8");
const liveHtml = read("public/battle/index.html");
const trialHtml = read("public/battle/trials/index.html");
const leaderboardHtml = read("public/battle/leaderboard/index.html");
const testHtml = read("public/battle/garden-bot-preview/index.html");
const liveBundlePath = "public/battle/assets/index-tree-lock-proof.js";
const previewBundlePath = "public/battle/assets/garden-bot-same-origin-preview.js";
const live = read(liveBundlePath);
const preview = read(previewBundlePath);
const netlify = read("netlify.toml");

test("the existing Garden Battles home/trials/leaderboard continue using their existing JS", () => {
  const originalRef = 'src="/battle/assets/index-tree-lock-proof.js"';
  for (const [name, html] of [["battle", liveHtml], ["trials", trialHtml], ["leaderboard", leaderboardHtml]]) {
    assert.ok(html.includes(originalRef), name + " must retain original production script");
    assert.ok(!html.includes("garden-bot-same-origin-preview.js"), name + " cannot start using preview code");
  }
  assert.ok(live.includes("[y,v]=p.useState(null)"), "the unchanged production bundle must retain its original state before approval");
});

test("preview page loads a distinct patched script and existing local assets", () => {
  assert.match(testHtml, /src="\/battle\/assets\/garden-bot-same-origin-preview\.js"/);
  assert.match(testHtml, /href="\/battle\/assets\/index-trdY-Mq5\.css"/);
  assert.match(testHtml, /content="noindex,nofollow"/);
  assert.ok(existsSync(path.join(root, previewBundlePath)));
});

test("preview fixes randomness initialization, preserves contract and treasury and adds a routable page", () => {
  assert.ok(preview.includes('RANDOM_OBJECT_CANDIDATES:["0x8","0x6"]'));
  assert.ok(preview.includes("[y,v]=p.useState(H.RANDOM_OBJECT_CANDIDATES[0])"));
  assert.ok(preview.includes('path:"/battle/garden-bot-preview"'));
  assert.ok(preview.includes('startBotBattle:xu'));
  assert.ok(preview.includes('create_ranked_bot_battle_v2_with_fifth_move'));
  assert.ok(preview.includes('[bot-start] wallet request opened'));
  assert.ok(preview.includes("Reroll blocked:"));
  verifyGardenBattlesBundle(preview);
});

test("Netlify serves the new route before the existing catch-all and preserves the original route", () => {
  const specific = netlify.indexOf('from = "/battle/garden-bot-preview"');
  const general = netlify.indexOf('from = "/battle/*"');
  assert.ok(specific >= 0 && general > specific);
  assert.ok(netlify.includes('to = "/battle/garden-bot-preview/index.html"'));
  assert.ok(netlify.includes('from = "/battle"\n  to = "/battle/index.html"'));
  assert.ok(netlify.includes('from = "/*"\n  to = "/index.html"'));
});
