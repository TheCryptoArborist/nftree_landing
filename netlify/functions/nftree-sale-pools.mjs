const SUI_RPC_URL = process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443";

const COLLECTION_PACKAGE_ID = "0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705";
const LATEST_PACKAGE_ID = "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5";
const MINT_CONFIG_ID = "0xe83616020f61f73b30c40fd3f888ed397626afd071bd4666374c306d8e98b06b";
const FALLBACK_MINT_PRICE_MIST = "25000000000";
const FALLBACK_TREASURY =
  "0x956624f2fbbdf16bb5e334b550efd975ff7677e34bbd4e18cb6f485756af6c08";

const SALE_POOLS = [
  {
    label: "Pool 1",
    description: "Original sale pool",
    poolId: "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a",
  },
  {
    label: "Pool 2",
    description: "Active expansion pool",
    poolId: "0xedd6b2d96968197bc121ad7bed064a43b5ad7d84cbb8b7c00d8fd78bea3e2e4d",
  },
  {
    label: "Pool 3",
    description: "Overflow pool for Tree NFT #1268-#1298",
    poolId: "0xed43f2ffb52ef542ea2cfccd0358431923460fec8ef659febda111614e20457a",
  },
];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": status === 200 ? "public, max-age=30, stale-while-revalidate=90" : "no-store",
      "content-type": "application/json",
    },
  });
}

function nftArrayFromFields(fields) {
  const rawNfts = fields?.nfts;
  if (Array.isArray(rawNfts)) return rawNfts;
  if (Array.isArray(rawNfts?.fields?.contents)) return rawNfts.fields.contents;
  if (Array.isArray(rawNfts?.contents)) return rawNfts.contents;
  return [];
}

function nftNumber(nft) {
  const value = nft?.number ?? nft?.fields?.number ?? "";
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function rarityFromNft(nft) {
  return String(nft?.rarity ?? nft?.fields?.rarity ?? "Unranked");
}

function rarityBreakdown(nfts) {
  const counts = {};
  for (const nft of nfts) {
    const rarity = rarityFromNft(nft);
    counts[rarity] = (counts[rarity] || 0) + 1;
  }
  return counts;
}

async function rpc(method, params, signal) {
  const response = await fetch(SUI_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
    signal,
  });

  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Sui RPC returned ${response.status}.`);
  }
  return payload.result;
}

async function fetchSalePool(pool, signal) {
  const result = await rpc(
    "sui_getObject",
    [pool.poolId, { showContent: true, showType: true, showOwner: true }],
    signal,
  );
  const fields = result?.data?.content?.fields || {};
  const nfts = nftArrayFromFields(fields);
  const numbers = nfts.map(nftNumber).filter((value) => value !== undefined).sort((left, right) => left - right);

  return {
    ...pool,
    count: nfts.length,
    firstNumber: numbers[0] || null,
    lastNumber: numbers[numbers.length - 1] || null,
    rarityBreakdown: rarityBreakdown(nfts),
    objectType: result?.data?.type || "",
    version: result?.data?.version || "",
  };
}

async function fetchMintConfig(signal) {
  const result = await rpc(
    "sui_getObject",
    [MINT_CONFIG_ID, { showContent: true, showType: true, showOwner: true }],
    signal,
  );
  const fields = result?.data?.content?.fields || {};

  return {
    admin: String(fields.admin || ""),
    mintPriceMist: String(fields.mint_price_mist || FALLBACK_MINT_PRICE_MIST),
    treasury: String(fields.treasury || FALLBACK_TREASURY),
  };
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-origin": "*",
      },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const [mintConfig, pools] = await Promise.all([
      fetchMintConfig(controller.signal),
      Promise.all(SALE_POOLS.map((pool) => fetchSalePool(pool, controller.signal))),
    ]);
    const totalAvailable = pools.reduce((total, pool) => total + pool.count, 0);
    const activePool = pools.find((pool) => pool.count > 0) || null;

    return jsonResponse({
      collectionPackageId: COLLECTION_PACKAGE_ID,
      latestPackageId: LATEST_PACKAGE_ID,
      mintConfigId: MINT_CONFIG_ID,
      mintPriceMist: mintConfig.mintPriceMist,
      treasury: mintConfig.treasury,
      totalAvailable,
      activePoolId: activePool?.poolId || "",
      activePoolLabel: activePool?.label || "",
      pools,
      fetchedAt: new Date().toISOString(),
      source: "sui-rpc",
    });
  } catch (error) {
    return jsonResponse(
      {
        collectionPackageId: COLLECTION_PACKAGE_ID,
        latestPackageId: LATEST_PACKAGE_ID,
        mintConfigId: MINT_CONFIG_ID,
        mintPriceMist: FALLBACK_MINT_PRICE_MIST,
        treasury: FALLBACK_TREASURY,
        error: error instanceof Error ? error.message : "NFTree sale-pool lookup failed.",
        pools: SALE_POOLS,
        source: "sui-rpc",
      },
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const config = {
  path: "/api/nftree-sale-pools",
  method: ["GET", "OPTIONS"],
};

