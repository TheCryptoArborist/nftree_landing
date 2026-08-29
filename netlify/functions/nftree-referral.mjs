import { getStore } from "@netlify/blobs";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { activeChallengeKey, authenticateReferralClaim, cleanupExpiredChallenges, createReferralChallenge, enforceChallengeRateLimit, finalizeReferralClaim, findActiveChallenge, normalizeWalletAddress, recordOnce, reserveReferralClaim, validateClaimTransactionWindow, verifiedReferralRecord } from "./referral-core.mjs";

const RPC_URL = process.env.SUI_JSON_RPC_URL || "https://fullnode.mainnet.sui.io:443";
const suiClient = new SuiJsonRpcClient({ url: RPC_URL });

async function sourceHash(request) {
  const source = (request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 128);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function personalMessageVerifier(client = suiClient, verifier = verifyPersonalMessageSignature) {
  return (message, signature, address) => verifier(message, signature, { address, client });
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function fetchTransaction(digest, fetchImpl = fetch) {
  const rpcResponse = await fetchImpl(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sui_getTransactionBlock",
      params: [digest, { showInput: true, showEffects: true }],
    }),
  });
  if (!rpcResponse.ok) throw Object.assign(new Error("Sui transaction verification is unavailable."), { status: 503 });
  const payload = await rpcResponse.json();
  if (payload.error || !payload.result) throw Object.assign(new Error("Sui transaction was not found."), { status: 425 });
  return payload.result;
}

export function createReferralHandler({
  getReferralStore = () => getStore("nftree-referrals"),
  fetchTransactionImpl = fetchTransaction,
  verifySignature = personalMessageVerifier(),
  context = () => process.env.CONTEXT,
} = {}) {
  return async (request) => {
    if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);
    try {
      const input = await request.json();
      const store = getReferralStore();
      if (input.action === "challenge") {
        const walletAddress = normalizeWalletAddress(input.walletAddress);
        const requestSource = await sourceHash(request);
        await cleanupExpiredChallenges(store).catch(() => {});
        const active = await findActiveChallenge(store, walletAddress, input.referralCode, requestSource);
        if (active) return response({ challengeId: active.id, message: active.message, expiresAt: active.expiresAt, reused: true });
        await enforceChallengeRateLimit(store, walletAddress, requestSource);
        const activeKey = activeChallengeKey(walletAddress, input.referralCode, requestSource);
        const challenge = createReferralChallenge({
          id: crypto.randomUUID(), walletAddress, referralCode: input.referralCode,
        });
        challenge.activeKey = activeKey;
        await store.setJSON(`challenges/${challenge.id}`, challenge, { onlyIfNew: true });
        await store.setJSON(`active/${activeKey}`, { challengeId: challenge.id, expiresAt: Date.parse(challenge.expiresAt) });
        return response({ challengeId: challenge.id, message: challenge.message, expiresAt: challenge.expiresAt });
      }
      if (context() !== "production") {
        return response({ error: "Referral records are disabled outside the production deploy." }, 403);
      }
      if (!input.digest || !input.walletAddress || !input.poolId) return response({ error: "Missing mint details." }, 400);
      if (!input.challengeId || !input.signature) return response({ error: "Missing signed referral claim." }, 400);
      // Authenticate the wallet-bound claim before spending any upstream RPC capacity.
      const authentication = await authenticateReferralClaim(input, store, verifySignature);
      const tx = await fetchTransactionImpl(String(input.digest));
      const record = verifiedReferralRecord(input, tx);
      validateClaimTransactionWindow(authentication, Date.parse(record.transactionTimestamp));
      await reserveReferralClaim(input, authentication, store);
      const result = await recordOnce(store, record);
      await finalizeReferralClaim(input, authentication, store);
      return response({ recorded: true, duplicate: result.duplicate, transactionDigest: record.transactionDigest });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Referral attribution failed.";
      const deterministic = /Invalid|Unknown|Missing|challenge|signature|wallet|pool|transaction|payment amount|mint target|did not succeed|already used/i.test(message);
      const status = Number(error?.status) || (message.includes("rate limit") ? 429 : error instanceof SyntaxError ? 400 : deterministic ? 422 : 500);
      return response({ error: message }, status);
    }
  };
}

export default createReferralHandler();

export const config = { method: ["POST"] };
