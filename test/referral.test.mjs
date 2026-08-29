import test from "node:test";
import assert from "node:assert/strict";
import { readStoredReferral, REFERRAL_MAX_AGE_MS } from "../public/referral-storage.js";
import { cleanupExpiredChallenges, createReferralChallenge, enforceChallengeRateLimit, normalizeWalletAddress, PACKAGE_ID, recordOnce, verifiedReferralRecord, verifyReferralClaim } from "../netlify/functions/referral-core.mjs";
import { personalMessageVerifier } from "../netlify/functions/nftree-referral.mjs";
import { prepareReferralClaim } from "../public/referral-preflight.js";

const POOL = "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a";
const WALLET = `0x${"0".repeat(61)}123`;

function storageWith(payload) {
  let value = JSON.stringify(payload);
  return {
    getItem: () => value,
    removeItem: () => { value = null; },
    current: () => value,
  };
}

function validTransaction(overrides = {}, paymentMist = "30000000000") {
  return {
    effects: { status: { status: "success" } },
    timestampMs: 1_700_000_000_000,
    transaction: {
      data: {
        sender: WALLET,
        transaction: {
          inputs: [
            { Object: { SharedObject: { objectId: POOL } } },
            { Pure: { value: paymentMist } },
          ],
          transactions: [
            { SplitCoins: [{ GasCoin: true }, [{ Input: 1 }]] },
            { MoveCall: {
              package: PACKAGE_ID,
              module: "collection",
              function: "purchase",
              arguments: [{ Input: 0 }, { Result: 0 }],
            } },
          ],
        },
      },
    },
    ...overrides,
  };
}

test("actual NestedResult split-coin payment is verified", () => {
  const tx = validTransaction();
  tx.transaction.data.transaction.transactions[1].MoveCall.arguments[1] = { NestedResult: [0, 0] };
  const record = verifiedReferralRecord(input, tx);
  assert.equal(record.mintPriceMist, "30000000000");
  assert.equal(record.commissionAmountDueMist, "1500000000");

  tx.transaction.data.transaction.transactions[1].MoveCall.arguments[1] = { NestedResult: [0, 1] };
  assert.throws(() => verifiedReferralRecord(input, tx), /payment amount is unavailable/);
});

test("challenge addresses are validated and normalized before persistence", () => {
  assert.equal(normalizeWalletAddress("0xAbC"), `0x${"0".repeat(61)}abc`);
  for (const invalid of ["abc", "0x", "0xzz", `0x${"a".repeat(65)}`, 123]) {
    assert.throws(() => createReferralChallenge({ id: "id", walletAddress: invalid, referralCode: "mischief-finance" }), /Invalid Sui/);
  }
});

test("challenge issuance is rate limited by wallet and request source", async () => {
  const values = new Map();
  const store = mapStore(values);
  await enforceChallengeRateLimit(store, WALLET, "source", 1000);
  await assert.rejects(enforceChallengeRateLimit(store, WALLET, "other-source", 1000), /rate limit/);
  await assert.rejects(enforceChallengeRateLimit(store, `0x${"1".repeat(64)}`, "source", 1000), /rate limit/);
});

test("expired challenges and rate buckets are cleaned up", async () => {
  const values = new Map([
    ["challenges/old", { expiresAt: new Date(999).toISOString() }],
    ["challenges/current", { expiresAt: new Date(2001).toISOString() }],
    ["rate/0/source", { expiresAt: 999 }],
  ]);
  await cleanupExpiredChallenges(mapStore(values), 2000);
  assert.equal(values.has("challenges/old"), false);
  assert.equal(values.has("rate/0/source"), false);
  assert.equal(values.has("challenges/current"), true);
});

test("personal-message verification supplies address and Sui client", async () => {
  const client = { network: "test" };
  let options;
  await personalMessageVerifier(client, async (_message, _signature, received) => { options = received; })(new Uint8Array(), "sig", WALLET);
  assert.deepEqual(options, { address: WALLET, client });
});

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
  assert.throws(() => verifiedReferralRecord({ ...input, walletAddress: `0x${"1".repeat(64)}` }, validTransaction()), /sender/);
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
    delete: async (key) => { values.delete(key); },
  };
  const record = verifiedReferralRecord(input, validTransaction());
  assert.equal((await recordOnce(store, record)).duplicate, false);
  assert.equal((await recordOnce(store, record)).duplicate, true);
  assert.equal(values.size, 1);
  assert.equal(record.mintPriceMist, "30000000000");
  assert.equal(record.commissionAmountDueMist, "1500000000");
});

test("signed referral challenge is wallet-bound, one-time, and safely retryable for one digest", async () => {
  const values = new Map();
  const store = {
    get: async (key) => values.get(key) || null,
    setJSON: async (key, value, options) => {
      assert.equal(options.onlyIfNew, true);
      if (values.has(key)) throw new Error("already exists");
      values.set(key, value);
    },
    delete: async (key) => { values.delete(key); },
  };
  const now = 1_700_000_000_000;
  const challenge = createReferralChallenge({ id: "challenge-1", walletAddress: WALLET, referralCode: "mischief-finance" }, now);
  values.set("challenges/challenge-1", challenge);
  const claim = { ...input, challengeId: challenge.id, signature: "wallet-signature" };
  let verified = 0;
  const verifier = async (message, signature, address) => {
    assert.equal(new TextDecoder().decode(message), challenge.message);
    assert.equal(signature, "wallet-signature");
    assert.equal(address, WALLET);
    verified += 1;
  };
  await verifyReferralClaim(claim, store, verifier, now + 1000);
  assert.equal(values.has("challenges/challenge-1"), false);
  await verifyReferralClaim(claim, store, verifier, now + 1000);
  assert.equal(verified, 1);
  await assert.rejects(
    verifyReferralClaim({ ...claim, digest: "digest-2" }, store, verifier, now + 1000),
    /already used/,
  );
  await assert.rejects(
    verifyReferralClaim({ ...claim, walletAddress: `0x${"1".repeat(64)}` }, store, verifier, now + 1000),
    /does not match/,
  );
});

test("historical mint outside the signed challenge window is rejected", async () => {
  const now = 1_700_000_000_000;
  const challenge = createReferralChallenge({ id: "historical", walletAddress: WALLET, referralCode: "mischief-finance" }, now);
  const store = challengeStore(challenge);
  await assert.rejects(
    verifyReferralClaim({ ...input, challengeId: challenge.id, signature: "sig" }, store, async () => {}, now - 1),
    /outside the referral challenge window/,
  );
});

test("mint inside challenge window is accepted and an idempotent retry is accepted after expiry", async () => {
  const now = 1_700_000_000_000;
  const challenge = createReferralChallenge({ id: "delayed", walletAddress: WALLET, referralCode: "mischief-finance" }, now);
  const store = challengeStore(challenge);
  const claim = { ...input, challengeId: challenge.id, signature: "sig" };
  // The first server submission itself may be delayed; the on-chain timestamp is the security boundary.
  await verifyReferralClaim(claim, store, async () => {}, now + 1000);
  await verifyReferralClaim(claim, store, async () => {}, now + 1000);
  await assert.rejects(
    verifyReferralClaim({ ...claim, digest: "different" }, store, async () => {}, now + 1000),
    /already used/,
  );
});

test("referral preflight failures and unsupported personal-message signing allow an unattributed mint", async () => {
  const failureCases = [
    {
      requestChallenge: async () => { throw new Error("challenge unavailable"); },
      signClaim: async () => ({ signature: "unused" }),
    },
    {
      requestChallenge: async () => ({ challengeId: "id", message: "message" }),
      signClaim: async () => { throw new Error("signing unsupported"); },
    },
  ];
  for (const { requestChallenge, signClaim } of failureCases) {
    const result = await prepareReferralClaim({
      referralCode: "mischief-finance", walletAddress: WALLET,
      requestChallenge, signClaim,
    });
    assert.equal(result.claim, null);
    assert.ok(result.error);
  }
});

function challengeStore(challenge) {
  const values = new Map([[`challenges/${challenge.id}`, challenge]]);
  return {
    get: async (key) => values.get(key) || null,
    setJSON: async (key, value) => {
      if (values.has(key)) throw new Error("already exists");
      values.set(key, value);
    },
  };
}

function mapStore(values) {
  return {
    get: async (key) => values.get(key) || null,
    setJSON: async (key, value, options = {}) => {
      if (options.onlyIfNew && values.has(key)) throw new Error("already exists");
      values.set(key, value);
    },
    delete: async (key) => { values.delete(key); },
    list: async ({ prefix }) => ({ blobs: [...values.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) }),
  };
}
