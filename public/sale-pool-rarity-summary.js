const SALE_POOL_API_URL = "/api/nftree-sale-pools";
const RARITY_ORDER = ["Common", "Rare", "Epic", "Legendary", "Mythic", "One of One"];
const numberFormatter = new Intl.NumberFormat("en-US");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function normalizeRarity(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) return "Unranked";
  if (["1 of 1", "one of one", "oneofone", "1/1"].includes(normalized)) return "One of One";

  const known = RARITY_ORDER.find((rarity) => rarity.toLowerCase() === normalized);
  if (known) return known;

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function aggregateRarities(pools) {
  const counts = new Map(RARITY_ORDER.map((rarity) => [rarity, 0]));
  let breakdownTotal = 0;

  for (const pool of pools) {
    const breakdown = pool?.rarityBreakdown;
    if (!breakdown || typeof breakdown !== "object") continue;

    for (const [rawRarity, rawCount] of Object.entries(breakdown)) {
      const count = safeCount(rawCount);
      const rarity = normalizeRarity(rawRarity);
      counts.set(rarity, (counts.get(rarity) || 0) + count);
      breakdownTotal += count;
    }
  }

  return { counts, breakdownTotal };
}

function rarityCards(payload) {
  const pools = Array.isArray(payload?.pools) ? payload.pools : [];
  const { counts, breakdownTotal } = aggregateRarities(pools);
  const reportedTotal = safeCount(payload?.totalAvailable);
  const grandTotal = reportedTotal || breakdownTotal;

  if (grandTotal > breakdownTotal) {
    counts.set("Unranked", (counts.get("Unranked") || 0) + (grandTotal - breakdownTotal));
  }

  const extras = [...counts.keys()]
    .filter((rarity) => !RARITY_ORDER.includes(rarity) && safeCount(counts.get(rarity)) > 0)
    .sort((left, right) => left.localeCompare(right));
  const orderedRarities = [...RARITY_ORDER, ...extras];

  const cards = orderedRarities.map((rarity) => {
    const count = safeCount(counts.get(rarity));
    const noun = count === 1 ? "NFTree" : "NFTrees";
    return `
      <article class="sale-pool-card sale-pool-rarity-card" data-sale-pool-rarity-card data-rarity="${escapeHtml(rarity)}">
        <div>
          <span>${escapeHtml(rarity)}</span>
          <strong>${numberFormatter.format(count)}</strong>
        </div>
        <small>${noun} available</small>
      </article>
    `;
  });

  cards.push(`
    <article class="sale-pool-card sale-pool-rarity-card sale-pool-total-card is-active" data-sale-pool-rarity-card data-rarity="Total">
      <div>
        <span>Grand total</span>
        <strong>${numberFormatter.format(grandTotal)}</strong>
      </div>
      <small>Across all NFTree sales pools</small>
    </article>
  `);

  return cards.join("");
}

function unavailableCard() {
  return `
    <article class="sale-pool-card sale-pool-rarity-card sale-pool-total-card" data-sale-pool-rarity-card data-rarity="Unavailable">
      <div>
        <span>Rarity inventory</span>
        <strong>Temporarily unavailable</strong>
      </div>
      <small>The grand total above remains the latest available pool count.</small>
    </article>
  `;
}

function relabelInventory() {
  const summaryCards = document.querySelectorAll(".sale-pool-summary > div");
  summaryCards[0]?.querySelector("span")?.replaceChildren("Grand total");
  summaryCards[1]?.querySelector("span")?.replaceChildren("Minting from");

  const totalStat = document.querySelector("#salePoolCount")?.closest(".stat-card");
  totalStat?.querySelector("span")?.replaceChildren("Sale pool total");
}

function initializeRaritySummary() {
  const grid = document.querySelector("#salePoolGrid");
  if (!grid) return;

  const referralBanner = document.querySelector("#referralSummary");
  referralBanner?.remove();

  grid.classList.add("sale-pool-rarity-grid");
  grid.setAttribute("aria-label", "NFTree sale-pool rarity inventory");
  grid.setAttribute("aria-live", "polite");
  relabelInventory();

  let latestMarkup = "";
  const render = (markup) => {
    latestMarkup = markup;
    grid.innerHTML = markup;
  };

  const observer = new MutationObserver(() => {
    if (!latestMarkup || grid.querySelector("[data-sale-pool-rarity-card]")) return;
    grid.innerHTML = latestMarkup;
  });
  observer.observe(grid, { childList: true });

  fetch(`${SALE_POOL_API_URL}?raritySummary=${Date.now()}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || `Sale-pool inventory returned ${response.status}.`);
      }
      return payload;
    })
    .then((payload) => render(rarityCards(payload)))
    .catch((error) => {
      console.warn("NFTree rarity inventory could not be rendered.", error);
      render(unavailableCard());
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeRaritySummary, { once: true });
} else {
  initializeRaritySummary();
}
