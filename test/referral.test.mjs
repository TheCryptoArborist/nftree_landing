import test from "node:test";
import assert from "node:assert/strict";
import { readStoredReferral, REFERRAL_MAX_AGE_MS } from "../public/referral-storage.js";
import { CHALLENGE_RETENTION_MS, cleanupExpiredChallenges, createReferralChallenge, enforceChallengeRateLimit, findActiveChallenge, MISCHIEF_COMMISSION_RECIPIENT, normalizeWalletAddress, PACKAGE_ID, recordOnce, verifiedReferralRecord, verifyReferralClaim } from "../netlify/functions/referral-core.mjs";
import { createReferralHandler, personalMessageVerifier } from "../netlify/functions/nftree-referral.mjs";
import { clearPreparedReferralClaim, prepareReferralClaim } from "../public/referral-preflight.js";
import { MAX_REFERRAL_RETRIES, nextPendingClaim, ReferralRequestError, shouldRetryReferral } from "../public/referral-retry.js";

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
            { SplitCoins: ["GasCoin", [{ Input: 1 }]] },
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
  assert.equal(record.commissionRecipient, MISCHIEF_COMMISSION_RECIPIENT);

  tx.transaction.data.transaction.transactions[1].MoveCall.arguments[1] = { NestedResult: [0, 1] };
  assert.throws(() => verifiedReferralRecord(input, tx), /payment amount is unavailable/);
});

test("challenge addresses are validated and normalized before persistence", () => {
  assert.equal(normalizeWalletAddress("0xAbC"), `0x${"0".repeat(61)}abc`);
  for (const invalid of ["abc", "0x", "0xzz", `0x${"a".repeat(65)}`, 123]) {
    assert.throws(() => createReferralChallenge({ id: "id", walletAddress: invalid, referralCode: "mischief-finance" }), /Invalid Sui/);
  }
});

test("challenge issuance is rate limited by request source only", async () => {
  const values = new Map();
  const store = mapStore(values);
  await enforceChallengeRateLimit(store, "source", 1000);
  await assert.rejects(enforceChallengeRateLimit(store, "source", 1000), /rate limit/);
  await enforceChallengeRateLimit(store, "other-source", 1000);
});

test("expired challenges and rate buckets are cleaned up", async () => {
  const values = new Map([
    ["challenges/old", { retainUntil: new Date(999).toISOString() }],
    ["challenges/current", { retainUntil: new Date(2001).toISOString() }],
    ["rate/0/source", { expiresAt: 999 }],
  ]);
  await cleanupExpiredChallenges(mapStore(values), 2000);
  assert.equal(values.has("challenges/old"), false);
  assert.equal(values.has("rate/0/source"), false);
  assert.equal(values.has("challenges/current"), true);
});

test("expired authorization proof is retained for delayed claims, then cleaned up", async () => {
  const now = 1_700_000_000_000;
  const challenge = createReferralChallenge({ id: "retained", walletAddress: WALLET, referralCode: "mischief-finance" }, now);
  const values = new Map([[`challenges/${challenge.id}`, challenge]]);
  await cleanupExpiredChallenges(mapStore(values), Date.parse(challenge.expiresAt) + 1);
  assert.equal(values.has(`challenges/${challenge.id}`), true);
  await verifyReferralClaim({ ...input, challengeId: challenge.id, signature: "sig" }, mapStore(values), async () => {}, now + 1000);
  assert.equal(values.has(`claims/${challenge.id}`), true);

  const unclaimed = createReferralChallenge({ id: "eventual", walletAddress: WALLET, referralCode: "mischief-finance" }, now);
  values.set(`challenges/${unclaimed.id}`, unclaimed);
  await cleanupExpiredChallenges(mapStore(values), now + CHALLENGE_RETENTION_MS + 1);
  assert.equal(values.has(`challenges/${unclaimed.id}`), false);
});

test("personal-message verification supplies address and Sui client", async () => {
  const client = { network: "test" };
  let options;
  await personalMessageVerifier(client, async (_message, _signature, received) => { options = received; return true; })(new Uint8Array(), "sig", WALLET);
  assert.deepEqual(options, { address: WALLET, client });

  await assert.rejects(
    personalMessageVerifier(client, async () => false)(new Uint8Array(), "bad", WALLET),
    (error) => error.status === 422 && error.transient === false,
  );
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

test("canonical application-generated payment is accepted and determines commission", () => {
  const record = verifiedReferralRecord(input, validTransaction({}, "100000000000"));
  assert.equal(record.mintPriceMist, "100000000000");
  assert.equal(record.commissionAmountDueMist, "5000000000");
});

test("canonical split source accepts only literal GasCoin or its legitimate object form", () => {
  const unrelatedString = validTransaction();
  unrelatedString.transaction.data.transaction.transactions[0].SplitCoins[0] = "Coin";
  assert.throws(() => verifiedReferralRecord(input, unrelatedString), /payment amount is unavailable/);

  const nonGasInput = validTransaction();
  nonGasInput.transaction.data.transaction.transactions[0].SplitCoins[0] = { Input: 0 };
  assert.throws(() => verifiedReferralRecord(input, nonGasInput), /payment amount is unavailable/);

  const objectGasCoin = validTransaction();
  objectGasCoin.transaction.data.transaction.transactions[0].SplitCoins[0] = { GasCoin: true };
  assert.equal(verifiedReferralRecord(input, objectGasCoin).mintPriceMist, "30000000000");
});

test("payment coin split after its verified split is rejected", () => {
  const tx = validTransaction({}, "100000000000");
  const programmable = tx.transaction.data.transaction;
  programmable.inputs.push({ Pure: { value: "75000000000" } });
  programmable.transactions.splice(1, 0, {
    SplitCoins: [{ NestedResult: [0, 0] }, [{ Input: 2 }]],
  });
  programmable.transactions[2].MoveCall.arguments[1] = { NestedResult: [0, 0] };
  assert.throws(() => verifiedReferralRecord(input, tx), /payment amount is unavailable/);
});

test("payment coin receiving a merge before purchase is rejected", () => {
  const tx = validTransaction();
  const programmable = tx.transaction.data.transaction;
  programmable.transactions.splice(1, 0, {
    MergeCoins: [{ NestedResult: [0, 0] }, [{ GasCoin: true }]],
  });
  programmable.transactions[2].MoveCall.arguments[1] = { NestedResult: [0, 0] };
  assert.throws(() => verifiedReferralRecord(input, tx), /payment amount is unavailable/);
});

test("multiple NFTree purchase calls are rejected", () => {
  const tx = validTransaction();
  tx.transaction.data.transaction.transactions.push({
    MoveCall: {
      package: PACKAGE_ID,
      module: "collection",
      function: "purchase",
      arguments: [{ Input: 0 }, { NestedResult: [0, 0] }],
    },
  });
  assert.throws(() => verifiedReferralRecord(input, tx), /ambiguous/);
});

test("purchase using a pool different from the claimed pool is rejected", () => {
  const otherEligiblePool = "0xedd6b2d96968197bc121ad7bed064a43b5ad7d84cbb8b7c00d8fd78bea3e2e4d";
  const tx = validTransaction();
  tx.transaction.data.transaction.inputs[0].Object.SharedObject.objectId = otherEligiblePool;
  assert.throws(() => verifiedReferralRecord(input, tx), /does not match the claimed pool/);
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

test("cancelled mint retry reuses its signed, unconsumed challenge", async () => {
  let requests = 0;
  let signatures = 0;
  const options = {
    referralCode: "mischief-finance", walletAddress: WALLET,
    requestChallenge: async () => { requests += 1; return { challengeId: "retry", message: "sign", expiresAt: new Date(Date.now() + 60_000).toISOString() }; },
    signClaim: async () => { signatures += 1; return { signature: "sig" }; },
  };
  clearPreparedReferralClaim(options.referralCode, options.walletAddress);
  const first = await prepareReferralClaim(options);
  const retry = await prepareReferralClaim(options);
  assert.deepEqual(retry.claim, first.claim);
  assert.equal(retry.reused, true);
  assert.equal(requests, 1);
  assert.equal(signatures, 1);
});

test("challenge lookup reuses valid challenges and rejects expired or consumed ones", async () => {
  const now = Date.now();
  const activeKey = `${WALLET}/mischief-finance/source`;
  const challenge = { ...createReferralChallenge({ id: "active", walletAddress: WALLET, referralCode: "mischief-finance" }, now), activeKey };
  const values = new Map([
    [`challenges/${challenge.id}`, challenge],
    [`active/${activeKey}`, { challengeId: challenge.id, expiresAt: Date.parse(challenge.expiresAt) }],
  ]);
  const store = mapStore(values);
  assert.equal((await findActiveChallenge(store, WALLET, "mischief-finance", "source", now)).id, challenge.id);
  assert.equal(await findActiveChallenge(store, WALLET, "mischief-finance", "source", Date.parse(challenge.expiresAt) + 1), null);
  values.set(`active/${activeKey}`, { challengeId: challenge.id, expiresAt: Date.parse(challenge.expiresAt) });
  values.delete(`challenges/${challenge.id}`); // consumed challenges are absent.
  assert.equal(await findActiveChallenge(store, WALLET, "mischief-finance", "source", now), null);
});

test("repeated challenge endpoint request returns the existing Blob", async () => {
  const values = new Map();
  const handler = createReferralHandler({ getReferralStore: () => mapStore(values) });
  const request = () => new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1" },
    body: JSON.stringify({ action: "challenge", walletAddress: WALLET, referralCode: "mischief-finance" }),
  });
  const first = await (await handler(request())).json();
  const second = await (await handler(request())).json();
  assert.equal(second.challengeId, first.challengeId);
  assert.equal(second.reused, true);
  assert.equal([...values.keys()].filter((key) => key.startsWith("challenges/")).length, 1);
});

test("one abusive source cannot block another source from challenging the same wallet", async () => {
  const values = new Map();
  const handler = createReferralHandler({ getReferralStore: () => mapStore(values) });
  const request = (walletAddress, trustedSource, forwardedSource = "caller-controlled") => new Request("https://example.test/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nf-client-connection-ip": trustedSource,
      "x-forwarded-for": forwardedSource,
    },
    body: JSON.stringify({ action: "challenge", walletAddress, referralCode: "mischief-finance" }),
  });

  const first = await handler(request(WALLET, "192.0.2.10", "198.51.100.1"));
  assert.equal(first.status, 200);
  const reused = await (await handler(request(WALLET, "192.0.2.10", "198.51.100.2"))).json();
  assert.equal(reused.reused, true);

  const abusiveRepeat = await handler(request(`0x${"1".repeat(64)}`, "192.0.2.10", "198.51.100.3"));
  assert.equal(abusiveRepeat.status, 429);

  const victimFromAnotherSource = await handler(request(WALLET, "192.0.2.11", "198.51.100.1"));
  assert.equal(victimFromAnotherSource.status, 200);
});

test("record endpoint authenticates before making any Sui RPC call", async () => {
  const now = Date.now();
  const challenge = createReferralChallenge({ id: "auth-order", walletAddress: WALLET, referralCode: "mischief-finance" }, now);
  const store = mapStore(new Map([[`challenges/${challenge.id}`, challenge]]));
  const body = { ...input, challengeId: challenge.id, signature: "bad" };
  let rpcCalls = 0;
  const rejected = createReferralHandler({
    getReferralStore: () => store, context: () => "production",
    verifySignature: async () => { throw new Error("Signature mismatch."); },
    fetchTransactionImpl: async () => { rpcCalls += 1; return validTransaction({ timestampMs: now + 1000 }); },
  });
  const badResponse = await rejected(new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body) }));
  assert.equal(badResponse.status, 422);
  const badPayload = await badResponse.json();
  const permanentError = new ReferralRequestError(badPayload.error, badResponse.status);
  assert.equal(shouldRetryReferral(permanentError), false);
  assert.equal(shouldRetryReferral(permanentError) ? nextPendingClaim(body, now) : null, null);
  assert.equal(rpcCalls, 0);

  const unavailable = createReferralHandler({
    getReferralStore: () => store, context: () => "production",
    verifySignature: async () => { throw Object.assign(new Error("upstream details"), { status: 503, transient: true }); },
    fetchTransactionImpl: async () => { rpcCalls += 1; return validTransaction({ timestampMs: now + 1000 }); },
  });
  const unavailableResponse = await unavailable(new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body) }));
  const unavailablePayload = await unavailableResponse.json();
  assert.equal(unavailableResponse.status, 503);
  assert.equal(unavailablePayload.error, "Referral signature verification is temporarily unavailable.");
  assert.equal(shouldRetryReferral(new ReferralRequestError(unavailablePayload.error, unavailableResponse.status)), true);
  assert.equal(rpcCalls, 0);

  const networkFailure = createReferralHandler({
    getReferralStore: () => store, context: () => "production",
    verifySignature: async () => { throw new Error("JWK fetch failed"); },
    fetchTransactionImpl: async () => { rpcCalls += 1; return validTransaction({ timestampMs: now + 1000 }); },
  });
  const networkResponse = await networkFailure(new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body) }));
  const networkPayload = await networkResponse.json();
  const networkError = new ReferralRequestError(networkPayload.error, networkResponse.status);
  assert.equal(networkResponse.status, 503);
  assert.equal(shouldRetryReferral(networkError), true);
  assert.ok(nextPendingClaim(body, now));
  assert.equal(rpcCalls, 0);

  const order = [];
  const accepted = createReferralHandler({
    getReferralStore: () => store, context: () => "production",
    verifySignature: async () => { order.push("signature"); },
    fetchTransactionImpl: async () => { order.push("rpc"); return validTransaction({ timestampMs: now + 1000 }); },
  });
  assert.equal((await accepted(new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body) }))).status, 200);
  assert.deepEqual(order, ["signature", "rpc"]);
});

test("one signed challenge atomically reserves exactly one concurrent digest", async () => {
  const now = Date.now();
  const challenge = createReferralChallenge({ id: "race", walletAddress: WALLET, referralCode: "mischief-finance" }, now);
  const values = new Map([[`challenges/${challenge.id}`, challenge]]);
  const store = mapStore(values);
  let arrivals = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const handler = createReferralHandler({
    getReferralStore: () => store,
    context: () => "production",
    verifySignature: async () => {},
    fetchTransactionImpl: async () => {
      arrivals += 1;
      if (arrivals === 2) release();
      await gate;
      return validTransaction({ timestampMs: now + 1000 });
    },
  });
  const submit = (digest) => handler(new Request("https://example.test/api", {
    method: "POST",
    body: JSON.stringify({ ...input, digest, challengeId: challenge.id, signature: "sig" }),
  }));
  const responses = await Promise.all([submit("race-a"), submit("race-b")]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 422]);
  const reservation = values.get(`claims/${challenge.id}`);
  assert.ok(["race-a", "race-b"].includes(reservation.digest));
  const due = [...values.entries()].filter(([key, value]) => key.startsWith("transactions/") && value.paymentStatus === "due");
  assert.equal(due.length, 1);
  assert.equal(due[0][1].transactionDigest, reservation.digest);
});

test("retry classification keeps transient failures, removes permanent failures, and is bounded", () => {
  assert.equal(shouldRetryReferral(new ReferralRequestError("server", 503)), true);
  assert.equal(shouldRetryReferral(new ReferralRequestError("network")), true);
  assert.equal(shouldRetryReferral(new ReferralRequestError("invalid", 422)), false);
  let claim = { digest: "queued" };
  for (let attempt = 0; attempt < MAX_REFERRAL_RETRIES; attempt += 1) {
    const next = nextPendingClaim(claim, 1000);
    assert.ok(next.nextAttemptAt > 1000);
    claim = next;
  }
  assert.equal(nextPendingClaim(claim, 1000), null);
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
