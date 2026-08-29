export const ALLOWED_REFERRAL = Object.freeze({ code: "mischief-finance", name: "Mischief Finance" });
export const ELIGIBLE_POOLS = new Set([
  "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a",
  "0xedd6b2d96968197bc121ad7bed064a43b5ad7d84cbb8b7c00d8fd78bea3e2e4d",
  "0xed43f2ffb52ef542ea2cfccd0358431923460fec8ef659febda111614e20457a",
]);
export const PACKAGE_ID = "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5";
const normalize = (value) => String(value || "").toLowerCase();
export const CHALLENGE_MAX_AGE_MS = 10 * 60 * 1000;

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

export function createReferralChallenge({ id, walletAddress, referralCode }, now = Date.now()) {
  if (referralCode !== ALLOWED_REFERRAL.code) throw new Error("Unknown referral code.");
  const wallet = normalize(walletAddress);
  if (!id || !wallet) throw new Error("Missing referral challenge details.");
  const challenge = {
    id: String(id), walletAddress: wallet, referralCode,
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + CHALLENGE_MAX_AGE_MS).toISOString(),
  };
  return { ...challenge, message: referralChallengeMessage(challenge) };
}

export async function verifyReferralClaim(input, store, verifySignature, transactionTimestampMs) {
  const challenge = await store.get(`challenges/${input.challengeId}`, { type: "json" });
  if (!challenge) throw new Error("Referral challenge was not found.");
  if (challenge.referralCode !== input.referralCode || challenge.walletAddress !== normalize(input.walletAddress)) {
    throw new Error("Referral challenge does not match this wallet.");
  }
  const claimKey = `claims/${challenge.id}`;
  const existing = await store.get(claimKey, { type: "json" });
  if (existing && existing.digest !== input.digest) throw new Error("Referral challenge was already used.");
  const issuedAt = Date.parse(challenge.issuedAt);
  const expiresAt = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    throw new Error("Referral challenge window is invalid.");
  }
  if (!Number.isFinite(transactionTimestampMs) || transactionTimestampMs < issuedAt || transactionTimestampMs > expiresAt) {
    throw new Error("Mint transaction is outside the referral challenge window.");
  }
  await verifySignature(new TextEncoder().encode(referralChallengeMessage(challenge)), input.signature, challenge.walletAddress);
  if (!existing) {
    try { await store.setJSON(claimKey, { digest: input.digest }, { onlyIfNew: true }); }
    catch (error) {
      const raced = await store.get(claimKey, { type: "json" });
      if (!raced || raced.digest !== input.digest) throw error;
    }
  }
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

function containsObjectId(value, objectId) {
  if (typeof value === "string") return normalize(value) === objectId;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((item) => containsObjectId(item, objectId));
}

function commandKind(command, kind) {
  return command?.[kind] ?? command?.[kind[0].toLowerCase() + kind.slice(1)];
}

function inputIndex(argument) {
  const value = argument?.Input ?? argument?.input;
  return Number.isInteger(value) ? value : null;
}

function resultIndex(argument) {
  const value = argument?.Result ?? argument?.result;
  return Number.isInteger(value) ? value : null;
}

function pureInputValue(input) {
  const value = input?.Pure ?? input?.pure ?? input?.value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return String(value);
  if (value && typeof value === "object" && "value" in value) return String(value.value);
  return null;
}

function verifiedPurchasePaymentMist(data, commands) {
  const purchase = commands.find((command) => isPurchaseCommand(command));
  const call = purchase?.MoveCall || purchase?.moveCall || purchase;
  const splitIndex = resultIndex(call?.arguments?.[1]);
  const split = splitIndex === null ? null : commandKind(commands[splitIndex], "SplitCoins");
  const amountArgument = Array.isArray(split) ? split[1]?.[0] : split?.amounts?.[0];
  const amountIndex = inputIndex(amountArgument);
  const amount = amountIndex === null ? null : pureInputValue(data.transaction?.inputs?.[amountIndex]);
  if (!amount || !/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error("Verified mint payment amount is unavailable.");
  }
  return amount;
}

export function verifiedReferralRecord(input, tx) {
  if (input.referralCode !== ALLOWED_REFERRAL.code) throw new Error("Unknown referral code.");
  if (tx?.digest && tx.digest !== input.digest) throw new Error("Transaction digest does not match the verified transaction.");
  const walletAddress = normalize(input.walletAddress);
  const poolId = normalize(input.poolId);
  if (!ELIGIBLE_POOLS.has(poolId)) throw new Error("Ineligible sales pool.");
  if (tx?.effects?.status?.status !== "success") throw new Error("Sui transaction did not succeed.");

  const { data, commands } = transactionParts(tx);
  if (normalize(data.sender) !== walletAddress) throw new Error("Transaction sender does not match the minting wallet.");
  if (!commands.some(isPurchaseCommand)) throw new Error("Transaction did not call the NFTree sales-pool mint target.");
  if (!containsObjectId(data.transaction, poolId)) throw new Error("Transaction did not use the eligible sales pool.");

  const timestampMs = Number(tx.timestampMs);
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) throw new Error("Transaction timestamp is unavailable.");
  const mintPriceMist = verifiedPurchasePaymentMist(data, commands);
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
