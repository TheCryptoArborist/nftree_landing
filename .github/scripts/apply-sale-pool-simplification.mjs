import { readFile, writeFile, rm } from "node:fs/promises";

function matchCount(source, search) {
  if (typeof search === "string") return source.split(search).length - 1;
  const flags = search.flags.includes("g") ? search.flags : `${search.flags}g`;
  return [...source.matchAll(new RegExp(search.source, flags))].length;
}

function replaceOne(source, search, replacement, label) {
  const matches = matchCount(source, search);
  if (matches !== 1) throw new Error(`${label}: expected exactly one match, found ${matches}.`);
  return source.replace(search, replacement);
}

const appPath = "public/app.js";
let app = await readFile(appPath, "utf8");

app = replaceOne(
  app,
  '  mintPoolCount: document.querySelector("#mintPoolCount"),\n',
  '  mintPoolCount: document.querySelector("#mintPoolCount"),\n  mintPriceLabel: document.querySelector("#mintPriceLabel"),\n',
  "add mint-price element",
);

app = replaceOne(
  app,
  /function renderReferralState\(\) \{[\s\S]*?\n\}\n\nfunction captureReferralSource/,
  [
    "function renderReferralState() {",
    "  // Referral attribution remains active, but ambassador compensation is not public shop copy.",
    "  if (!elements.referralSummary) return;",
    "  elements.referralSummary.hidden = true;",
    '  elements.referralSummary.textContent = "";',
    "}",
    "",
    "function captureReferralSource",
  ].join("\n"),
  "hide public referral banner",
);

const rarityFunctions = [
  'const SALE_POOL_RARITY_ORDER = ["Common", "Rare", "Epic", "Legendary", "Mythic", "One of One"];',
  "",
  "function normalizeSalePoolRarity(value) {",
  '  const normalized = String(value || "")',
  "    .trim()",
  "    .toLowerCase()",
  '    .replace(/[_-]+/g, " ")',
  '    .replace(/\\s+/g, " ");',
  "",
  '  if (!normalized) return "Other / Unranked";',
  '  if (["1 of 1", "one of one", "oneofone", "1/1"].includes(normalized)) return "One of One";',
  "",
  "  const known = SALE_POOL_RARITY_ORDER.find((rarity) => rarity.toLowerCase() === normalized);",
  "  if (known) return known;",
  "  return normalized.replace(/\\b\\w/g, (character) => character.toUpperCase());",
  "}",
  "",
  "function salePoolRarityInventory(pools, reportedTotal) {",
  "  const counts = new Map(SALE_POOL_RARITY_ORDER.map((rarity) => [rarity, 0]));",
  "  let countedTotal = 0;",
  "  let hasBreakdown = false;",
  "",
  "  for (const pool of pools) {",
  "    const breakdown = pool?.rarityBreakdown;",
  '    if (!breakdown || typeof breakdown !== "object") continue;',
  "    hasBreakdown = true;",
  "",
  "    for (const [rawRarity, rawCount] of Object.entries(breakdown)) {",
  "      const numericCount = Number(rawCount);",
  "      const count = Number.isFinite(numericCount) && numericCount > 0 ? Math.trunc(numericCount) : 0;",
  "      const rarity = normalizeSalePoolRarity(rawRarity);",
  "      counts.set(rarity, (counts.get(rarity) || 0) + count);",
  "      countedTotal += count;",
  "    }",
  "  }",
  "",
  "  const numericReportedTotal = Number(reportedTotal);",
  "  const apiTotal = Number.isFinite(numericReportedTotal) && numericReportedTotal > 0",
  "    ? Math.trunc(numericReportedTotal)",
  "    : 0;",
  "  let total = apiTotal || countedTotal;",
  "",
  "  if (hasBreakdown && total > countedTotal) {",
  '    counts.set("Other / Unranked", (counts.get("Other / Unranked") || 0) + (total - countedTotal));',
  "    countedTotal = total;",
  "  } else if (hasBreakdown && countedTotal > total) {",
  '    console.warn("NFTree rarity inventory exceeded the reported sale-pool total; using the reconciled rarity total.");',
  "    total = countedTotal;",
  "  }",
  "",
  "  return { counts, hasBreakdown, total };",
  "}",
  "",
  "function renderSalePoolRarityInventory(pools, reportedTotal) {",
  "  const { counts, hasBreakdown, total } = salePoolRarityInventory(pools, reportedTotal);",
  "",
  "  if (!hasBreakdown) {",
  "    return {",
  "      total,",
  "      markup: `",
  '        <article class="sale-pool-card sale-pool-rarity-card sale-pool-rarity-unavailable">',
  "          <div>",
  "            <span>Rarity inventory</span>",
  "            <strong>Temporarily unavailable</strong>",
  "          </div>",
  "          <small>The grand total above remains the latest available inventory count.</small>",
  "        </article>",
  "      `,",
  "    };",
  "  }",
  "",
  "  const extras = [...counts.keys()]",
  "    .filter((rarity) => !SALE_POOL_RARITY_ORDER.includes(rarity) && Number(counts.get(rarity) || 0) > 0)",
  "    .sort((left, right) => left.localeCompare(right));",
  "  const orderedRarities = [...SALE_POOL_RARITY_ORDER, ...extras];",
  "  const markup = orderedRarities",
  "    .map((rarity) => {",
  "      const count = Number(counts.get(rarity) || 0);",
  "      return `",
  '        <article class="sale-pool-card sale-pool-rarity-card" data-rarity="${escapeHtml(rarity)}">',
  "          <div>",
  "            <span>${escapeHtml(rarity)}</span>",
  "            <strong>${formatInteger(count)}</strong>",
  "          </div>",
  "          <small>available to mint</small>",
  "        </article>",
  "      `;",
  "    })",
  '    .join("");',
  "",
  "  return { markup, total };",
  "}",
  "",
  "function renderListingCard",
].join("\n");

app = replaceOne(
  app,
  /function renderSalePoolCard\(pool, activePoolId\) \{[\s\S]*?\n\}\n\nfunction renderListingCard/,
  rarityFunctions,
  "replace per-pool renderer",
);

const applyReplacement = [
  "  const priceLabel = formatMistAsSui(safePayload.mintPriceMist || MINT_PRICE_MIST);",
  "  const rarityInventory = renderSalePoolRarityInventory(safePools, totalAvailable);",
  "  const displayTotal = rarityInventory.total || totalAvailable;",
  "",
  "  if (elements.mintPoolCount) {",
  '    elements.mintPoolCount.textContent = displayTotal ? `${formatInteger(displayTotal)} available` : "No pool inventory";',
  "  }",
  "  if (elements.mintPriceLabel) elements.mintPriceLabel.textContent = priceLabel;",
  '  if (elements.salePoolCount) elements.salePoolCount.textContent = displayTotal ? formatInteger(displayTotal) : "0";',
  '  if (elements.activePoolLabel) elements.activePoolLabel.textContent = activePool?.label || "No active pool";',
  "  if (elements.salePoolGrid) {",
  '    elements.salePoolGrid.classList.add("sale-pool-rarity-grid");',
  "    elements.salePoolGrid.innerHTML = rarityInventory.markup;",
  "  }",
].join("\n");

app = replaceOne(
  app,
  /  elements\.mintPoolCount\.textContent = totalAvailable[\s\S]*?  const priceLabel = formatMistAsSui\(safePayload\.mintPriceMist \|\| MINT_PRICE_MIST\);/,
  applyReplacement,
  "render rarity inventory from existing payload",
);

if (app.includes("A 5% commission will be recorded")) {
  throw new Error("Public commission copy still exists in app.js.");
}
if (app.includes("renderSalePoolCard(")) {
  throw new Error("Legacy per-pool renderer still exists in app.js.");
}
await writeFile(appPath, app);

const indexPath = "public/index.html";
let index = await readFile(indexPath, "utf8");
index = index.replace('    <link rel="stylesheet" href="/sale-pool-rarity-summary.css" />\n', "");
index = index.replace('    <script type="module" src="/sale-pool-rarity-summary.js"></script>\n', "");
index = replaceOne(index, "<h3>Mint from the active sale pool</h3>", "<h3>Mint from the NFTree inventory</h3>", "simplify mint heading");
index = replaceOne(
  index,
  "              This is the transaction path. Connect a wallet, review the live rarity inventory, then mint the next available\n              NFTree for 25 SUI.",
  "              Connect a wallet, review the live rarity mix, then mint the next available NFTree for 25 SUI.",
  "simplify mint copy",
);

const oldSummary = [
  '            <div class="sale-pool-summary" aria-label="NFTree sale pool inventory">',
  "              <div>",
  "                <span>Grand total</span>",
  '                <strong id="mintPoolCount">Checking pools</strong>',
  "              </div>",
  "              <div>",
  "                <span>Minting from</span>",
  '                <strong id="activePoolLabel">Loading</strong>',
  "              </div>",
  "            </div>",
  '            <div class="sale-pool-grid" id="salePoolGrid" aria-label="NFTree sale-pool rarity inventory"></div>',
].join("\n");
const newSummary = [
  '            <div class="sale-pool-summary" aria-label="NFTree mint inventory summary">',
  "              <div>",
  "                <span>Available to mint</span>",
  '                <strong id="mintPoolCount">Checking inventory</strong>',
  "              </div>",
  "              <div>",
  "                <span>Mint price</span>",
  '                <strong id="mintPriceLabel">Loading</strong>',
  "              </div>",
  '              <div class="sale-pool-active-source" hidden>',
  "                <span>Active pool</span>",
  '                <strong id="activePoolLabel">Loading</strong>',
  "              </div>",
  "            </div>",
  '            <div class="sale-pool-grid sale-pool-rarity-grid" id="salePoolGrid" aria-label="Rarity breakdown across all NFTree sales inventory" aria-live="polite"></div>',
].join("\n");
index = replaceOne(index, oldSummary, newSummary, "replace pool summary");

const oldMarketStats = [
  '            <div class="stats-grid compact" aria-label="NFTree listing stats">',
  '              <div class="stat-card">',
  "                <span>Listed</span>",
  '                <strong id="listedCount">Loading</strong>',
  "              </div>",
  '              <div class="stat-card">',
  "                <span>Floor</span>",
  '                <strong id="floorPrice">Loading</strong>',
  "              </div>",
  '              <div class="stat-card">',
  "                <span>Source</span>",
  "                <strong>TradePort</strong>",
  "              </div>",
  '              <div class="stat-card">',
  "                <span>Sale pool total</span>",
  '                <strong id="salePoolCount">Loading</strong>',
  "              </div>",
  "            </div>",
  '            <a class="button button-secondary" href="#listingGrid">Browse listings</a>',
].join("\n");
const newMarketStats = [
  '            <div class="stats-grid compact listing-market-stats" aria-label="NFTree listing stats">',
  '              <div class="stat-card">',
  "                <span>Listed</span>",
  '                <strong id="listedCount">Loading</strong>',
  "              </div>",
  '              <div class="stat-card">',
  "                <span>Floor</span>",
  '                <strong id="floorPrice">Loading</strong>',
  "              </div>",
  "            </div>",
  '            <a class="button button-secondary" href="#listingGrid">Browse on TradePort</a>',
].join("\n");
index = replaceOne(index, oldMarketStats, newMarketStats, "simplify TradePort card");

if (index.includes("referralSummary")) throw new Error("Referral banner element still exists in index.html.");
if (index.includes("sale-pool-rarity-summary.")) throw new Error("Temporary rarity asset reference still exists.");
await writeFile(indexPath, index);

const stylesPath = "public/styles.css";
let styles = await readFile(stylesPath, "utf8");
const marker = "/* Unified sale-pool rarity inventory */";
if (styles.includes(marker)) throw new Error("Integrated rarity styles already exist.");
styles += `

${marker}
.sale-pool-summary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sale-pool-active-source[hidden],
#referralSummary {
  display: none !important;
}

.sale-pool-grid.sale-pool-rarity-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.sale-pool-rarity-card {
  position: relative;
  overflow: hidden;
  min-height: 82px;
}

.sale-pool-rarity-card::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: linear-gradient(180deg, var(--cyan), var(--gold));
  content: "";
  opacity: 0.72;
}

.sale-pool-rarity-card strong {
  font-size: 1.28rem;
}

.sale-pool-rarity-card small {
  color: #d3e7fb;
}

.sale-pool-rarity-unavailable {
  grid-column: 1 / -1;
}

.listing-market-stats {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 820px) {
  .sale-pool-grid.sale-pool-rarity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .sale-pool-summary,
  .sale-pool-grid.sale-pool-rarity-grid {
    grid-template-columns: 1fr;
  }
}
`;
await writeFile(stylesPath, styles);

await rm("public/sale-pool-rarity-summary.js", { force: true });
await rm("public/sale-pool-rarity-summary.css", { force: true });
await rm(".github/workflows/apply-sale-pool-simplification.yml", { force: true });
await rm(".github/scripts/apply-sale-pool-simplification.mjs", { force: true });
