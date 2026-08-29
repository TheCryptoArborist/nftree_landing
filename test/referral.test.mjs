import test from "node:test";
import assert from "node:assert/strict";
import { readStoredReferral, REFERRAL_MAX_AGE_MS } from "../public/referral-storage.js";
import { PACKAGE_ID, recordOnce, verifiedReferralRecord } from "../netlify/functions/referral-core.mjs";

const POOL = "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a";
const WALLET = "0x123";

function storageWith(payload) {
  let value = JSON.stringify(payload);
  return {
    getItem: () => value,
    removeItem: () => { value = null; },
    current: () => value,
  };
}

function validTransaction(overrides = {}) {
  return {
    effects: { status: { status: "success" } },
    timestampMs: 1_700_000_000_000,
    transaction: {
      data: {
        sender: WALLET,
        transaction: {
          inputs: [{ Object: { SharedObject: { objectId: POOL } } }],
          transactions: [{ MoveCall: { package: PACKAGE_ID, module: "collection", function: "purchase" } }],
        },
      },
    },
    ...overrides,
  };
}

const input = { digest: "digest-1", walletAddress: WALLET, poolId: POOL, referralCode: "mischief-finance" };

test("active referral is restored within 30 days", () => {
  const now = Date.now();
  const storage = storageWith({ code: "mischief-finance", savedAt: new Date(now - 1000).toISOString() });
  assert.equal(readStoredReferral(storage, { cookie: "" }, now)?.code, "mischief-finance");
});

for (const [name, payload] of [
  ["expired referral", { code: "mischief-finance", savedAt: new Date(Date.now() - REFERRAL_MAX_AGE_MS).toISOString() }],
  ["invalid savedAt", { code: "mischief-finance", savedAt: "not-a-date" }],
  ["unknown referral code", { code: "someone-else", savedAt: new Date().toISOString() }],
]) {
  test(`${name} is rejected and cleared`, () => {
    const storage = storageWith(payload);
    const documentObject = { cookie: "unchanged" };
    assert.equal(readStoredReferral(storage, documentObject), null);
    assert.equal(storage.current(), null);
    assert.match(documentObject.cookie, /max-age=0/);
  });
}

test("failed Sui transaction is rejected", () => {
  assert.throws(() => verifiedReferralRecord(input, validTransaction({ effects: { status: { status: "failure" } } })), /did not succeed/);
});

test("unknown server-side referral code is rejected", () => {
  assert.throws(() => verifiedReferralRecord({ ...input, referralCode: "someone-else" }, validTransaction()), /Unknown/);
});

test("wrong wallet and ineligible pool are rejected", () => {
  assert.throws(() => verifiedReferralRecord({ ...input, walletAddress: "0xwrong" }, validTransaction()), /sender/);
  assert.throws(() => verifiedReferralRecord({ ...input, poolId: "0xbad" }, validTransaction()), /Ineligible/);
});

test("valid successful sales-pool mint is recorded once", async () => {
  const values = new Map();
  const store = {
    get: async (key) => values.get(key) || null,
    setJSON: async (key, value, options) => {
      assert.equal(options.onlyIfNew, true);
      if (values.has(key)) throw new Error("already exists");
      values.set(key, value);
    },
  };
  const record = verifiedReferralRecord(input, validTransaction());
  assert.equal((await recordOnce(store, record)).duplicate, false);
  assert.equal((await recordOnce(store, record)).duplicate, true);
  assert.equal(values.size, 1);
  assert.equal(record.commissionAmountDueMist, "1250000000");
});
