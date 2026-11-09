import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The canonical Garden Battles TypeScript source needs to be reconciled with
// the currently deployed bundle. Until then this regression checks the
// *actually shipped* NFTree browser entry and its specific initialization
// bug. The test deliberately fails if a later rebuild changes the entry.
const html = readFileSync(join(process.cwd(), "public/battle/index.html"), "utf8");
const match = html.match(/src="(\/battle\/assets\/index-[^"]+\.js)"/);
assert.ok(match, "Garden Battles index must reference its browser bundle");
const bundle = readFileSync(join(process.cwd(), "public", match[1].slice(1)), "utf8");

test("Garden Bot initializes Sui Random 0x8 synchronously", () => {
  assert.ok(bundle.includes('RANDOM_OBJECT_CANDIDATES:["0x8","0x6"]'),
    "Sui Random object 0x8 must remain the primary candidate");
  assert.ok(bundle.includes("[y,v]=p.useState(H.RANDOM_OBJECT_CANDIDATES[0])"),
    "Wallet provider must have Random 0x8 before the async RPC effect settles");
  assert.ok(!bundle.includes(
    ",[h,g]=p.useState(H.ENTRY_FEE),[y,v]=p.useState(null),[x,m]=p.useState([])"
  ), "Do not restore the initialization race");
});

test("Garden Bot startup still requires wallet and preserves native submission", () => {
  assert.ok(bundle.includes('startBotBattle:xu'), "Garden Bot callback must be exported");
  assert.ok(bundle.includes('if(!U||!y)throw new Error("Wallet not connected or random object not initialised")'),
    "Wallet/start guards must remain in place");
  assert.ok(bundle.includes('"create_ranked_bot_battle_v2_standard"'),
    "Current bot contract entry must be preserved");
  assert.ok(bundle.includes('"create_ranked_bot_battle_v2_with_fifth_move"'),
    "Fifth battle card entitlement must remain intact");
  assert.ok(bundle.includes("[bot-start] wallet request opened"),
    "Native wallet submission path must remain intact");
});
