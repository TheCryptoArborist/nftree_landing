export const ALLOWED_REFERRAL = Object.freeze({ code: "mischief-finance", name: "Mischief Finance" });
export const ELIGIBLE_POOLS = new Set([
  "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a",
  "0xedd6b2d96968197bc121ad7bed064a43b5ad7d84cbb8b7c00d8fd78bea3e2e4d",
  "0xed43f2ffb52ef542ea2cfccd0358431923460fec8ef659febda111614e20457a",
]);
export const PACKAGE_ID = "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5";
export const MINT_PRICE_MIST = "25000000000";

const normalize = (value) => String(value || "").toLowerCase();

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
  return {
    transactionDigest: String(input.digest),
    walletAddress,
    poolId,
    referralCode: ALLOWED_REFERRAL.code,
    referralName: ALLOWED_REFERRAL.name,
    transactionTimestamp: new Date(timestampMs).toISOString(),
    mintPriceMist: MINT_PRICE_MIST,
    commissionPercentage: 5,
    commissionAmountDueMist: (BigInt(MINT_PRICE_MIST) * 5n / 100n).toString(),
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
