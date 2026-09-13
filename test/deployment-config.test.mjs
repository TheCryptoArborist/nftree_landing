import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const OLD_PACKAGE_ID = "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5";
const NEW_PACKAGE_ID = "0x79459345a7abde29c4763c97c65f8f48b9e9878dc077ea7ab57c0ad7d585c736";
const POOL_4 = "0xfa7b71037b2a8a6bbe36b6cfbccca629f698c767aeb9dad603a0c655adf4de2a";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("NFTree deployment configuration uses the current package and Pool 4", async () => {
  const [salePools, app, walletSource, walletBundle, referralCore] = await Promise.all([
    source("netlify/functions/nftree-sale-pools.mjs"),
    source("public/app.js"),
    source("src/wallet-mint.js"),
    source("public/assets/nftree-wallet-mint.js"),
    source("netlify/functions/referral-core.mjs"),
  ]);

  for (const [name, content] of [
    ["sale-pool API", salePools],
    ["mint page", app],
    ["wallet source", walletSource],
    ["wallet bundle", walletBundle],
    ["referral verifier", referralCore],
  ]) {
    assert.ok(content.includes(NEW_PACKAGE_ID), `${name} is missing the current package ID`);
    assert.ok(!content.includes(OLD_PACKAGE_ID), `${name} still contains the retired package ID`);
  }

  assert.ok(salePools.includes(POOL_4), "sale-pool API is missing Pool 4");
  assert.ok(app.includes(POOL_4), "mint-page fallback is missing Pool 4");
  assert.ok(referralCore.includes(POOL_4), "referral eligibility is missing Pool 4");
  assert.equal((salePools.match(/label: "Pool [1-4]"/g) || []).length, 4);
  assert.ok(app.includes("totalAvailable: 3515"), "mint-page fallback total is not 3515");
});
