const COLLECTION_URL = "https://www.tradeport.xyz/sui/collection/0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT?bottomTab=trades&tab=items";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      "content-type": "application/json",
    },
  });
}

function nearby(text, needle, radius = 220) {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return "";
  return text.slice(Math.max(0, i - radius), Math.min(text.length, i + needle.length + radius));
}

export default async () => {
  try {
    const response = await fetch(COLLECTION_URL, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "text/html,application/xhtml+xml",
      },
    });
    const html = await response.text();
    const needles = ["total_sales", "total_volume", "1D Sales", "All Vol", "recent_actions", "collection_stats", "Tree Nft"];
    const matches = Object.fromEntries(needles.map((needle) => [needle, nearby(html, needle)]));
    return jsonResponse({
      status: response.status,
      contentLength: html.length,
      matches,
      head: html.slice(0, 1200),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export const config = { method: ["GET"] };
