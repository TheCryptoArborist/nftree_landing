import { getStore } from "@netlify/blobs";
import { recordOnce, verifiedReferralRecord } from "./referral-core.mjs";

const RPC_URL = process.env.SUI_JSON_RPC_URL || "https://fullnode.mainnet.sui.io:443";

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
  if (!rpcResponse.ok) throw new Error("Sui transaction verification is unavailable.");
  const payload = await rpcResponse.json();
  if (payload.error || !payload.result) throw new Error("Sui transaction was not found.");
  return payload.result;
}

export default async (request) => {
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);
  if (process.env.CONTEXT !== "production") {
    return response({ error: "Referral records are disabled outside the production deploy." }, 403);
  }
  try {
    const input = await request.json();
    if (!input.digest || !input.walletAddress || !input.poolId) return response({ error: "Missing mint details." }, 400);
    const tx = await fetchTransaction(String(input.digest));
    const record = verifiedReferralRecord(input, tx);
    const result = await recordOnce(getStore("nftree-referrals"), record);
    return response({ recorded: true, duplicate: result.duplicate, transactionDigest: record.transactionDigest });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Referral attribution failed." }, 422);
  }
};

export const config = { method: ["POST"] };
