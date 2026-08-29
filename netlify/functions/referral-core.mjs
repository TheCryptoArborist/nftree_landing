export const ALLOWED_REFERRAL = Object.freeze({ code: "mischief-finance", name: "Mischief Finance" });
export const ELIGIBLE_POOLS = new Set([
  "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a",
  "0xedd6b2d96968197bc121ad7bed064a43b5ad7d84cbb8b7c00d8fd78bea3e2e4d",
  "0xed43f2ffb52ef542ea2cfccd0358431923460fec8ef659febda111614e20457a",
]);
export const PACKAGE_ID = "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5";
const normalize = (value) => String(value || "").toLowerCase();
export const CHALLENGE_MAX_AGE_MS = 10 * 60 * 1000;
// Pending claims are retried for a bounded period in the browser. Retain the
// signed proof substantially longer so an offline tab can safely resume.
export const CHALLENGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export function referralChallengeMessage(challenge) {
  return [
    "NFTree referral attribution",
    `Challenge: ${challenge.id}`,
    `Wallet: ${challenge.walletAddress}`,
    `Referral: ${challenge.referralCode}`,
    `Issued: ${challenge.issuedAt}`,
    `Expires: ${challenge.expiresAt}`,
  ].join("\n");
}

export function normalizeWalletAddress(walletAddress) {
  if (typeof walletAddress !== "string" || walletAddress.length > 66 || !/^0x[0-9a-fA-F]{1,64}$/.test(walletAddress)) {
    throw new Error("Invalid Sui wallet address.");
  }
  return `0x${walletAddress.slice(2).toLowerCase().padStart(64, "0")}`;
}

export function createReferralChallenge({ id, walletAddress, referralCode }, now = Date.now()) {
  if (referralCode !== ALLOWED_REFERRAL.code) throw new Error("Unknown referral code.");
  const wallet = normalizeWalletAddress(walletAddress);
  if (!id) throw new Error("Missing referral challenge details.");
  const challenge = {
    id: String(id), walletAddress: wallet, referralCode,
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + CHALLENGE_MAX_AGE_MS).toISOString(),
    retainUntil: new Date(now + CHALLENGE_RETENTION_MS).toISOString(),
  };
  return { ...challenge, message: referralChallengeMessage(challenge) };
}

export async function authenticateReferralClaim(input, store, verifySignature) {
  const claimKey = `claims/${input.challengeId}`;
  const existing = await store.get(claimKey, { type: "json" });
  if (existing) {
    if (existing.digest !== input.digest) throw new Error("Referral challenge was already used.");
    if (existing.walletAddress && existing.walletAddress !== normalizeWalletAddress(input.walletAddress)) {
      throw new Error("Referral challenge does not match this wallet.");
    }
    return { existing, challenge: null };
  }
  const challenge = await store.get(`challenges/${input.challengeId}`, { type: "json" });
  if (!challenge) throw new Error("Referral challenge was not found.");
  if (challenge.referralCode !== input.referralCode || challenge.walletAddress !== normalizeWalletAddress(input.walletAddress)) {
    throw new Error("Referral challenge does not match this wallet.");
  }
  const issuedAt = Date.parse(challenge.issuedAt);
  const expiresAt = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    throw new Error("Referral challenge window is invalid.");
  }
  try {
    await verifySignature(new TextEncoder().encode(referralChallengeMessage(challenge)), input.signature, challenge.walletAddress);
  } catch {
    throw new Error("Referral signature verification failed.");
  }
  return { existing: null, challenge, issuedAt, expiresAt };
}

export function validateClaimTransactionWindow(authentication, transactionTimestampMs) {
  if (authentication.existing) return;
  if (!Number.isFinite(transactionTimestampMs) || transactionTimestampMs < authentication.issuedAt || transactionTimestampMs > authentication.expiresAt) {
    throw new Error("Mint transaction is outside the referral challenge window.");
  }
}

export async function reserveReferralClaim(input, authentication, store, now = Date.now()) {
  if (authentication.existing) return { reservation: authentication.existing, duplicate: true };
  const reservation = {
    challengeId: input.challengeId,
    digest: input.digest,
    walletAddress: authentication.challenge.walletAddress,
    referralCode: authentication.challenge.referralCode,
    status: "reserved",
    createdAt: new Date(now).toISOString(),
    retainUntil: authentication.challenge.retainUntil,
  };
  const key = `claims/${input.challengeId}`;
  try {
    await store.setJSON(key, reservation, { onlyIfNew: true });
    return { reservation, duplicate: false };
  } catch (error) {
    const existing = await store.get(key, { type: "json" });
    if (existing?.digest === input.digest && existing.walletAddress === reservation.walletAddress) {
      return { reservation: existing, duplicate: true };
    }
    if (existing) throw new Error("Referral challenge was already reserved for another mint.");
    throw error;
  }
}

export async function finalizeReferralClaim(input, authentication, store) {
  const key = `claims/${input.challengeId}`;
  const reservation = await store.get(key, { type: "json" });
  if (!reservation || reservation.digest !== input.digest || reservation.walletAddress !== normalizeWalletAddress(input.walletAddress)) {
    throw new Error("Referral claim reservation does not match this mint.");
  }
  try { await store.setJSON(key, { ...reservation, status: "finalized", finalizedAt: new Date().toISOString() }); } catch { /* Reservation remains retryable. */ }
  try { await store.delete(`challenges/${input.challengeId}`); } catch { /* Cleanup is ancillary. */ }
  if (authentication.challenge?.activeKey) {
    try { await store.delete(`active/${authentication.challenge.activeKey}`); } catch { /* Cleanup is ancillary. */ }
  }
}

// Composition used by focused unit tests; production follows the same
// authenticate -> verify transaction window -> reserve -> finalize ordering.
export async function verifyReferralClaim(input, store, verifySignature, transactionTimestampMs) {
  const authentication = await authenticateReferralClaim(input, store, verifySignature);
  validateClaimTransactionWindow(authentication, transactionTimestampMs);
  await reserveReferralClaim(input, authentication, store, transactionTimestampMs);
  await finalizeReferralClaim(input, authentication, store);
}

export async function cleanupExpiredChallenges(store, now = Date.now()) {
  for (const prefix of ["challenges/", "rate/", "active/"]) {
    const result = await store.list({ prefix });
    for (const blob of result.blobs) {
      const value = await store.get(blob.key, { type: "json" });
      const expiresAt = prefix === "challenges/" ? Date.parse(value?.retainUntil) : Number(value?.expiresAt);
      if (!value || !Number.isFinite(expiresAt) || expiresAt < now) await store.delete(blob.key);
    }
  }
}

export async function enforceChallengeRateLimit(store, walletAddress, sourceHash, now = Date.now()) {
  const bucket = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  for (const identity of [`wallet-${walletAddress}`, `source-${sourceHash}`]) {
    try {
      await store.setJSON(`rate/${bucket}/${identity}`, { expiresAt: now + RATE_LIMIT_WINDOW_MS }, { onlyIfNew: true });
    } catch {
      throw new Error("Referral challenge rate limit exceeded.");
    }
  }
}

export function activeChallengeKey(walletAddress, referralCode, sourceHash) {
  return `${normalizeWalletAddress(walletAddress)}/${referralCode}/${sourceHash}`;
}

export async function findActiveChallenge(store, walletAddress, referralCode, sourceHash, now = Date.now()) {
  const key = activeChallengeKey(walletAddress, referralCode, sourceHash);
  const pointer = await store.get(`active/${key}`, { type: "json" });
  if (!pointer?.challengeId) return null;
  const challenge = await store.get(`challenges/${pointer.challengeId}`, { type: "json" });
  if (challenge && Date.parse(challenge.expiresAt) > now) return challenge;
  try { await store.delete(`active/${key}`); } catch { /* Cleanup is ancillary. */ }
  return null;
}

function transactionParts(tx) {
  const data = tx?.transaction?.data || tx?.transaction || {};
  const programmable = data.transaction?.transactions || data.transaction?.kind?.ProgrammableTransaction?.commands || [];
  return { data, commands: programmable };
}

function isPurchaseCommand(command) {
  const call = command?.MoveCall || command?.moveCall || command;
  return (
    normalize(call?.package) === PACKAGE_ID &&
    call?.module === "collection" &&
    call?.function === "purchase"
  );
}

function commandKind(command, kind) {
  return command?.[kind] ?? command?.[kind[0].toLowerCase() + kind.slice(1)];
}

function inputIndex(argument) {
  const value = argument?.Input ?? argument?.input;
  return Number.isInteger(value) ? value : null;
}

function resultReference(argument) {
  const value = argument?.Result ?? argument?.result;
  if (Number.isInteger(value)) return { commandIndex: value, outputIndex: 0, nested: false };
  const nested = argument?.NestedResult ?? argument?.nestedResult;
  if (Array.isArray(nested) && nested.length === 2 && nested.every(Number.isInteger)) {
    return { commandIndex: nested[0], outputIndex: nested[1], nested: true };
  }
  return null;
}

function pureInputValue(input) {
  const value = input?.Pure ?? input?.pure ?? input?.value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return String(value);
  if (value && typeof value === "object" && "value" in value) return String(value.value);
  return null;
}

function objectInputId(input) {
  const object = input?.Object ?? input?.object ?? input;
  return normalize(object?.SharedObject?.objectId ?? object?.sharedObject?.objectId ?? object?.ImmOrOwnedObject?.objectId ?? object?.objectId);
}

function purchasePaymentMist(data, commands, call) {
  const reference = resultReference(call?.arguments?.[1]);
  // splitCoins returns one coin for each amount; purchase must use its first (and only) output.
  const split = !reference || reference.outputIndex !== 0 ? null : commandKind(commands[reference.commandIndex], "SplitCoins");
  const amountArgument = Array.isArray(split) ? split[1]?.[0] : split?.amounts?.[0];
  const amountCount = Array.isArray(split) ? split[1]?.length : split?.amounts?.length;
  const amountIndex = inputIndex(amountArgument);
  const amount = amountIndex === null ? null : pureInputValue(data.transaction?.inputs?.[amountIndex]);
  if (amountCount !== 1 || !amount || !/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error("Verified mint payment amount is unavailable.");
  }
  return amount;
}

export function verifiedReferralRecord(input, tx) {
  if (input.referralCode !== ALLOWED_REFERRAL.code) throw new Error("Unknown referral code.");
  if (tx?.digest && tx.digest !== input.digest) throw new Error("Transaction digest does not match the verified transaction.");
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const poolId = normalize(input.poolId);
  if (!ELIGIBLE_POOLS.has(poolId)) throw new Error("Ineligible sales pool.");
  if (tx?.effects?.status?.status !== "success") throw new Error("Sui transaction did not succeed.");

  const { data, commands } = transactionParts(tx);
  if (normalize(data.sender) !== walletAddress) throw new Error("Transaction sender does not match the minting wallet.");
  const inputs = data.transaction?.inputs || [];
  const candidates = commands.filter(isPurchaseCommand).flatMap((command) => {
    const call = command?.MoveCall || command?.moveCall || command;
    const poolIndex = inputIndex(call?.arguments?.[0]);
    const commandPool = poolIndex === null ? "" : objectInputId(inputs[poolIndex]);
    return commandPool === poolId && ELIGIBLE_POOLS.has(commandPool) ? [{ call, poolId: commandPool }] : [];
  });
  if (candidates.length === 0) throw new Error("Transaction did not contain a qualifying NFTree purchase.");
  if (candidates.length !== 1) throw new Error("Transaction contains ambiguous qualifying NFTree purchases.");

  const timestampMs = Number(tx.timestampMs);
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) throw new Error("Transaction timestamp is unavailable.");
  const mintPriceMist = purchasePaymentMist(data, commands, candidates[0].call);
  return {
    transactionDigest: String(input.digest),
    walletAddress,
    poolId,
    referralCode: ALLOWED_REFERRAL.code,
    referralName: ALLOWED_REFERRAL.name,
    transactionTimestamp: new Date(timestampMs).toISOString(),
    mintPriceMist,
    commissionPercentage: 5,
    commissionAmountDueMist: (BigInt(mintPriceMist) * 5n / 100n).toString(),
    paymentStatus: "due",
  };
}

export async function recordOnce(store, record) {
  const key = `transactions/${record.transactionDigest}`;
  const existing = await store.get(key, { type: "json" });
  if (existing) return { record: existing, duplicate: true };
  try {
    await store.setJSON(key, record, { onlyIfNew: true });
    return { record, duplicate: false };
  } catch (error) {
    const racedRecord = await store.get(key, { type: "json" });
    if (racedRecord) return { record: racedRecord, duplicate: true };
    throw error;
  }
}
