const TRADEPORT_GRAPHQL_URL = "https://graphql.tradeport.gg";
const COLLECTION_ID = "c9e46101-b0d0-4251-8731-212792288300";
const COLLECTION_URL =
  "https://www.tradeport.xyz/sui/collection/0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT?tab=items";
const NFTREE_TYPE =
  "0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT";
const MIST_PER_SUI = 1_000_000_000n;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

const LISTINGS_QUERY = `query fetchNFTreeListings($where: listings_bool_exp!, $order_by: [listings_order_by!], $offset: Int, $limit: Int!) {
  sui {
    listings(where: $where, order_by: $order_by, offset: $offset, limit: $limit) {
      id
      price
      block_time
      listed
      nft {
        id
        token_id
        token_id_index
        name
        media_url
        media_type
        ranking
        rarity
        owner
        chain_state
      }
    }
  }
}`;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": status === 200 ? "public, max-age=45, stale-while-revalidate=120" : "no-store",
      "content-type": "application/json",
    },
  });
}

function isSuiAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40,64}$/.test(value.trim());
}

function nftreeTypeFromState(state) {
  return state?.nft_type || state?.bcs?.type || "";
}

function nftreeNumberFromName(name) {
  const match = String(name || "").match(/#\s*(\d+)/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function textFromBcsBytes(bcsBytes) {
  if (!bcsBytes || typeof bcsBytes !== "string") return "";

  try {
    return Buffer.from(bcsBytes, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function normalizeRarity(value) {
  const rarity = String(value || "").trim();
  if (!rarity) return "";
  return rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase();
}

function rarityFromNFT(nft) {
  const directRarity = normalizeRarity(nft?.rarity);
  if (directRarity) return directRarity;

  const bcsText = textFromBcsBytes(nft?.chain_state?.bcs?.bcsBytes);
  const rarityMatch = bcsText.match(/Rarity:\s*([A-Za-z]+)/);
  return normalizeRarity(rarityMatch?.[1]) || "Unranked";
}

function priceMistFromUnknown(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  return 0n;
}

function formatSuiPrice(priceMist) {
  const whole = priceMist / MIST_PER_SUI;
  const fraction = priceMist % MIST_PER_SUI;
  if (fraction === 0n) return `${whole.toLocaleString("en-US")} SUI`;

  const fractionText = fraction.toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}.${fractionText.slice(0, 4)} SUI`;
}

function normalizeListing(listing) {
  const nft = listing?.nft;
  const nftObjectId = String(nft?.token_id || "").trim();
  const owner = String(nft?.owner || "").trim();
  const nftType = nftreeTypeFromState(nft?.chain_state);
  const priceMist = priceMistFromUnknown(listing?.price);

  if (!listing?.listed || nftType !== NFTREE_TYPE || priceMist <= 0n || !isSuiAddress(nftObjectId)) {
    return undefined;
  }

  const nftreeNumber = nftreeNumberFromName(nft?.name);
  const fallbackName = nftreeNumber ? `Tree NFT #${nftreeNumber}` : "NFTree";

  return {
    listingId: String(listing.id || ""),
    nftId: String(nft?.id || ""),
    nftObjectId,
    nftreeNumber,
    name: String(nft?.name || fallbackName),
    imageUrl: String(nft?.media_url || ""),
    mediaType: String(nft?.media_type || ""),
    rarity: rarityFromNFT(nft),
    ranking: Number.isSafeInteger(nft?.ranking) ? nft.ranking : null,
    owner: isSuiAddress(owner) ? owner : "",
    priceMist: priceMist.toString(),
    priceLabel: formatSuiPrice(priceMist),
    listedAt: listing.block_time ? new Date(`${listing.block_time}Z`).toISOString() : "",
    tradeportUrl: COLLECTION_URL,
  };
}

async function fetchListingPage(offset, signal) {
  const response = await fetch(TRADEPORT_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "7cJ09MM.9c8d37fc6e5fad1cf0823c68657cabdd",
      "x-api-user": "tradeport.xyz",
      "x-vercel-id": "wtf1::tvf3s-9171698922372-lci3z74vv1da",
    },
    body: JSON.stringify({
      query: LISTINGS_QUERY,
      variables: {
        where: {
          collection_id: { _eq: COLLECTION_ID },
          listed: { _eq: true },
          price: { _gt: 0 },
        },
        order_by: [{ price: "asc" }, { block_time: "desc" }],
        offset,
        limit: PAGE_SIZE,
      },
    }),
    signal,
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || `TradePort returned ${response.status}.`);
  }

  const listings = payload.data?.sui?.listings;
  if (!Array.isArray(listings)) throw new Error("TradePort listing data was not found.");
  return listings;
}

function sortListings(listings) {
  return listings.sort((left, right) => {
    const leftPrice = BigInt(left.priceMist);
    const rightPrice = BigInt(right.priceMist);
    if (leftPrice < rightPrice) return -1;
    if (leftPrice > rightPrice) return 1;
    return (left.nftreeNumber || Number.MAX_SAFE_INTEGER) - (right.nftreeNumber || Number.MAX_SAFE_INTEGER);
  });
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
    const listingMap = new Map();
    let offset = 0;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const pageListings = await fetchListingPage(offset, controller.signal);
      for (const listing of pageListings) {
        const normalized = normalizeListing(listing);
        if (normalized) listingMap.set(normalized.nftObjectId.toLowerCase(), normalized);
      }

      if (pageListings.length < PAGE_SIZE) break;
      offset += pageListings.length;
    }

    const listings = sortListings(Array.from(listingMap.values()));

    return jsonResponse({
      collectionId: COLLECTION_ID,
      collectionUrl: COLLECTION_URL,
      count: listings.length,
      fetchedAt: new Date().toISOString(),
      floorPrice: listings[0]?.priceLabel || "",
      listings,
      source: "tradeport-graphql",
    });
  } catch (error) {
    return jsonResponse(
      {
        collectionId: COLLECTION_ID,
        collectionUrl: COLLECTION_URL,
        error: error instanceof Error ? error.message : "NFTree listing lookup failed.",
        source: "tradeport-graphql",
      },
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const config = {
  path: "/api/nftree-listings",
  method: ["GET", "OPTIONS"],
};
