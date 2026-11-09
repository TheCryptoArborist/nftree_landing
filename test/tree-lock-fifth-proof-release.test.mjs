import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = name => readFileSync("public/battle/assets/" + name, "utf8");
const oldGuard = 'if(!Number.isInteger(r)||r<=0||r>15)return!1;';
const newGuard = oldGuard.replace("r>15", "r>31");
const oldPackage = "0x053f4cf0bd41ba3340a0580f4ae1aaca18656ba0032eb3e920de554309d97755", currentPackage = "0x4a77289a2cd3d54c18f16a17cc7fe7b8890322e60e566df8683391d5a479f7ec";
const names = ["index-tree-lock-v16.js", "garden-bot-same-origin-preview.js", "pvp-mobile-preview.js"];
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a); return source.slice(a, b);
}
const config = "0x" + "1".repeat(64), wallet = "0x" + "2".repeat(64);
function proof(bitmap = 16) {
  return { payload: { fifth_move_config_id: config, wallet, qualified: true,
    source_bitmap: bitmap, verified_underlying_tree_raw: "1000000000000", threshold_raw: "10000000000",
    config_version: "1", issued_at_ms: String(Date.now()), expires_at_ms: String(Date.now() + 60000) }, signatureBytes: Array(64).fill(0) };
}
test("release changes only the proof source mask and audited package in each existing game", () => {
  assert.equal(read(names[0]), read("index-BKkC2woN.js").replace(oldGuard, newGuard).replace(oldPackage, currentPackage));
  for (const [name, hash] of [[names[1], "f00247c223955f2b2d1a75bf0c5a1d7e6685b23f9ef49a268b56b83cdc7be86b"], [names[2], "4523c86ba719b406a976a57c98b8890915b9f255a1734a9abf22bc0cce463ba2"]]) {
    const s = read(name); assert.equal(s.split(newGuard).length, 2);
    assert.equal(createHash("sha256").update(s.replace(newGuard, oldGuard).replace(currentPackage, oldPackage)).digest("hex"), hash);
  }
});
for (const name of names) {
  const bundle = read(name);
  const validate = new Function("return (" + section(bundle, "function KH(", "function YH(") + ")")();
  test(`${name}: TREE Lock and mixed source proofs pass; malformed proofs stay blocked`, () => {
    for (const bitmap of [1, 2, 4, 8, 15, 16, 17, 20, 31]) assert.equal(validate(proof(bitmap), config), true, String(bitmap));
    for (const bitmap of [0, -1, 1.5, 32, 255]) assert.equal(validate(proof(bitmap), config), false);
    for (const edit of [p => p.signatureBytes.pop(), p => p.payload.qualified = false,
      p => p.payload.fifth_move_config_id = wallet, p => p.payload.verified_underlying_tree_raw = "1",
      p => p.payload.config_version = "0", p => p.payload.expires_at_ms = "1"]) {
      const p = proof(); edit(p); assert.equal(validate(p, config), false);
    }
  });
  test(`${name}: queue proof loader accepts TREE Lock, retains expiry and missing-proof stops`, async () => {
    const loader = response => new Function("Bq", "H", "Qt", "KH", "setTimeout", "return (" + section(bundle, "async function w2(", "function MK(") + ")")(
      async () => response, { FIFTH_MOVE_CONFIG_ID: config }, s => Buffer.from(s, "base64"), validate, fn => fn());
    const p = proof();
    const response = { ok: true, eligibility: { status: "qualified" }, attestation: { payload: p.payload, signature: Buffer.from(p.signatureBytes).toString("base64") } };
    assert.equal((await loader(response)(wallet)).payload.source_bitmap, 16);
    assert.equal(await loader({ ok: true, eligibility: { status: "not-qualified" } })(wallet), null);
    for (const invalid of [{ ok: true, eligibility: { status: "qualified" } },
      { ...response, attestation: { ...response.attestation, payload: { ...p.payload, expires_at_ms: String(Date.now() - 1000), issued_at_ms: "1" } } },
      { ...response, attestation: { ...response.attestation, payload: { ...p.payload, wallet: config } } }]) {
      await assert.rejects(loader(invalid)(wallet), /Entry was stopped before payment/);
    }
  });
}

test("all active games target the audited v16 package and refresh stale modules", () => {
  for (const name of names) {
    const bundle = read(name);
    assert.equal(bundle.match(/\bPACKAGE_ID:\s*["\'](0x[a-f0-9]+)["\']/)?.[1], currentPackage);
    assert.ok(bundle.includes("0x6f1020c2fd6c91129f7cb5e0d651295e87f7245f96b7d090715c89b38197e77f"));
    assert.ok(bundle.includes("Reroll blocked:"));
  }
  for (const file of ["garden-bot/index.html", "garden-bot-preview/index.html", "pvp-preview/index.html"])
    assert.match(readFileSync("public/battle/"+file,"utf8"), /\.js\?v=tree-lock-v16/);
});
