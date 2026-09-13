import { readFile, writeFile } from "node:fs/promises";

const OLD_PACKAGE_ID = "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5";
const NEW_PACKAGE_ID = "0x79459345a7abde29c4763c97c65f8f48b9e9878dc077ea7ab57c0ad7d585c736";
const POOL_1 = "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a";
const POOL_2 = "0xedd6b2d96968197bc121ad7bed064a43b5ad7d84cbb8b7c00d8fd78bea3e2e4d";
const POOL_3 = "0xed43f2ffb52ef542ea2cfccd0358431923460fec8ef659febda111614e20457a";
const POOL_4 = "0xfa7b71037b2a8a6bbe36b6cfbccca629f698c767aeb9dad603a0c655adf4de2a";

async function updateText(path, transform) {
  const original = await readFile(path, "utf8");
  const updated = transform(original);
  if (updated === original) throw new Error(`${path}: no change was produced.`);
  await writeFile(path, updated);
}

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}.`);
  return source.replace(search, replacement);
}

await updateText("netlify/functions/nftree-sale-pools.mjs", (source) => {
  let updated = replaceExactlyOnce(source, OLD_PACKAGE_ID, NEW_PACKAGE_ID, "sale-pool package ID");
  const match = updated.match(/const SALE_POOLS = \[[\s\S]*?\n\];/);
  if (!match) throw new Error("SALE_POOLS configuration was not found.");
  if (match[0].includes(POOL_4)) throw new Error("Pool 4 is already present in SALE_POOLS.");
  const expanded = match[0].replace(
    /\n\];$/,
    `\n  {\n    label: "Pool 4",\n    description: "Current NFTree expansion pool",\n    poolId: "${POOL_4}",\n  },\n];`,
  );
  updated = updated.replace(match[0], expanded);
  return updated;
});

await updateText("public/app.js", (source) => {
  let updated = replaceExactlyOnce(source, OLD_PACKAGE_ID, NEW_PACKAGE_ID, "browser fallback package ID");
  const fallbackPattern = /const fallbackSalePoolStatus = \{[\s\S]*?\n\};\n\nconst state = \{/;
  const match = updated.match(fallbackPattern);
  if (!match) throw new Error("fallbackSalePoolStatus was not found.");
  const replacement = `const fallbackSalePoolStatus = {\n  latestPackageId: LATEST_PACKAGE_ID,\n  mintConfigId: MINT_CONFIG_ID,\n  mintPriceMist: MINT_PRICE_MIST,\n  treasury: "0x956624f2fbbdf16bb5e334b550efd975ff7677e34bbd4e18cb6f485756af6c08",\n  totalAvailable: 3515,\n  activePoolLabel: "Pool 1",\n  activePoolId: "${POOL_1}",\n  pools: [\n    {\n      label: "Pool 1",\n      description: "Primary NFTree sale pool",\n      poolId: "${POOL_1}",\n      count: 1072,\n    },\n    {\n      label: "Pool 2",\n      description: "NFTree sale pool",\n      poolId: "${POOL_2}",\n      count: 863,\n    },\n    {\n      label: "Pool 3",\n      description: "NFTree sale pool",\n      poolId: "${POOL_3}",\n      count: 900,\n    },\n    {\n      label: "Pool 4",\n      description: "Current NFTree expansion pool",\n      poolId: "${POOL_4}",\n      count: 680,\n    },\n  ],\n  source: "last-verified",\n};\n\nconst state = {`;
  updated = updated.replace(fallbackPattern, replacement);
  return updated;
});

await updateText("src/wallet-mint.js", (source) =>
  replaceExactlyOnce(source, OLD_PACKAGE_ID, NEW_PACKAGE_ID, "wallet fallback package ID"),
);

await updateText("netlify/functions/referral-core.mjs", (source) => {
  let updated = replaceExactlyOnce(source, OLD_PACKAGE_ID, NEW_PACKAGE_ID, "referral package ID");
  const match = updated.match(/export const ELIGIBLE_POOLS = new Set\(\[[\s\S]*?\n\]\);/);
  if (!match) throw new Error("ELIGIBLE_POOLS configuration was not found.");
  if (match[0].includes(POOL_4)) throw new Error("Pool 4 is already eligible for referrals.");
  const expanded = match[0].replace(/\n\]\);$/, `\n  "${POOL_4}",\n]);`);
  updated = updated.replace(match[0], expanded);
  return updated;
});

const regressionTest = `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\n\nconst OLD_PACKAGE_ID = "${OLD_PACKAGE_ID}";\nconst NEW_PACKAGE_ID = "${NEW_PACKAGE_ID}";\nconst POOL_4 = "${POOL_4}";\n\nasync function source(path) {\n  return readFile(new URL(\`../\${path}\`, import.meta.url), "utf8");\n}\n\ntest("NFTree deployment configuration uses the current package and Pool 4", async () => {\n  const [salePools, app, walletSource, walletBundle, referralCore] = await Promise.all([\n    source("netlify/functions/nftree-sale-pools.mjs"),\n    source("public/app.js"),\n    source("src/wallet-mint.js"),\n    source("public/assets/nftree-wallet-mint.js"),\n    source("netlify/functions/referral-core.mjs"),\n  ]);\n\n  for (const [name, content] of [\n    ["sale-pool API", salePools],\n    ["mint page", app],\n    ["wallet source", walletSource],\n    ["wallet bundle", walletBundle],\n    ["referral verifier", referralCore],\n  ]) {\n    assert.ok(content.includes(NEW_PACKAGE_ID), \`\${name} is missing the current package ID\`);\n    assert.ok(!content.includes(OLD_PACKAGE_ID), \`\${name} still contains the retired package ID\`);\n  }\n\n  assert.ok(salePools.includes(POOL_4), "sale-pool API is missing Pool 4");\n  assert.ok(app.includes(POOL_4), "mint-page fallback is missing Pool 4");\n  assert.ok(referralCore.includes(POOL_4), "referral eligibility is missing Pool 4");\n  assert.equal((salePools.match(/label: "Pool [1-4]"/g) || []).length, 4);\n  assert.ok(app.includes("totalAvailable: 3515"), "mint-page fallback total is not 3515");\n});\n`;

await writeFile("test/deployment-config.test.mjs", regressionTest);

console.log("Applied current NFTree package ID and Pool 4 configuration without touching NFT assets or minting.");
