const API_URL = "/api/nftree-listings";
const SALE_POOL_API_URL = "/api/nftree-sale-pools";
const COLLECTION_URL =
  "https://www.tradeport.xyz/sui/collection/0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT?tab=items";
const LATEST_PACKAGE_ID = "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5";
const MINT_CONFIG_ID = "0xe83616020f61f73b30c40fd3f888ed397626afd071bd4666374c306d8e98b06b";
const MINT_PRICE_MIST = "25000000000";

const fallbackListings = [
  {
    name: "Tree NFT #301",
    nftreeNumber: 301,
    rarity: "Rare",
    priceLabel: "TradePort",
    imageUrl:
      "https://black-persistent-capybara-279.mypinata.cloud/ipfs/bafybeibcs6wmqckyw2xmsl3u2m6si2uww5orz4l6ewbmio5scmllvux7le/301.jpg",
    tradeportUrl: COLLECTION_URL,
  },
  {
    name: "Tree NFT #333",
    nftreeNumber: 333,
    rarity: "Mythic",
    priceLabel: "TradePort",
    imageUrl:
      "https://black-persistent-capybara-279.mypinata.cloud/ipfs/bafybeibcs6wmqckyw2xmsl3u2m6si2uww5orz4l6ewbmio5scmllvux7le/333.jpg",
    tradeportUrl: COLLECTION_URL,
  },
  {
    name: "Tree NFT #377",
    nftreeNumber: 377,
    rarity: "Mythic",
    priceLabel: "TradePort",
    imageUrl:
      "https://black-persistent-capybara-279.mypinata.cloud/ipfs/bafybeibcs6wmqckyw2xmsl3u2m6si2uww5orz4l6ewbmio5scmllvux7le/377.jpg",
    tradeportUrl: COLLECTION_URL,
  },
];

const fallbackSalePoolStatus = {
  latestPackageId: LATEST_PACKAGE_ID,
  mintConfigId: MINT_CONFIG_ID,
  mintPriceMist: MINT_PRICE_MIST,
  treasury: "0x956624f2fbbdf16bb5e334b550efd975ff7677e34bbd4e18cb6f485756af6c08",
  totalAvailable: 1890,
  activePoolLabel: "Pool 1",
  activePoolId: "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a",
  pools: [
    {
      label: "Pool 1",
      description: "Original sale pool",
      poolId: "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a",
      count: 1081,
      firstNumber: 8,
      lastNumber: 1219,
    },
    {
      label: "Pool 2",
      description: "Active expansion pool",
      poolId: "0xedd6b2d96968197bc121ad7bed064a43b5ad7d84cbb8b7c00d8fd78bea3e2e4d",
      count: 780,
      firstNumber: 1220,
      lastNumber: 1999,
    },
    {
      label: "Pool 3",
      description: "Overflow pool for Tree NFT #1268-#1298",
      poolId: "0xed43f2ffb52ef542ea2cfccd0358431923460fec8ef659febda111614e20457a",
      count: 29,
      firstNumber: 1268,
      lastNumber: 1298,
    },
  ],
  source: "last-verified",
};

const state = {
  listings: [],
  rarity: "all",
  search: "",
  selectedWallet: "",
  salePoolStatus: fallbackSalePoolStatus,
};

const elements = {
  activePoolLabel: document.querySelector("#activePoolLabel"),
  floorPrice: document.querySelector("#floorPrice"),
  listedCount: document.querySelector("#listedCount"),
  listingGrid: document.querySelector("#listingGrid"),
  listingSearch: document.querySelector("#listingSearch"),
  listingStatus: document.querySelector("#listingStatus"),
  mintContractStatus: document.querySelector("#mintContractStatus"),
  mintPoolCount: document.querySelector("#mintPoolCount"),
  refreshListings: document.querySelector("#refreshListings"),
  salePoolCount: document.querySelector("#salePoolCount"),
  salePoolGrid: document.querySelector("#salePoolGrid"),
  tradeportCollection: document.querySelector("#tradeportCollection"),
  selectedWalletLabel: document.querySelector("#selectedWalletLabel"),
  walletConnectButton: document.querySelector("#walletConnectButton"),
  walletOptions: document.querySelectorAll(".wallet-option"),
  walletPickerStatus: document.querySelector("#walletPickerStatus"),
};

function setStatus(message, isError = false) {
  elements.listingStatus.textContent = message;
  elements.listingStatus.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortId(value) {
  const id = String(value || "");
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

function formatInteger(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("en-US") : "0";
}

function formatMistAsSui(value) {
  const mist = BigInt(String(value || "0"));
  const whole = mist / 1_000_000_000n;
  const fraction = mist % 1_000_000_000n;
  if (fraction === 0n) return `${whole.toLocaleString("en-US")} SUI`;
  const fractionText = fraction.toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}.${fractionText.slice(0, 4)} SUI`;
}

function salePoolRange(pool) {
  if (!pool.firstNumber || !pool.lastNumber) return "No numbered NFTrees";
  if (pool.firstNumber === pool.lastNumber) return `#${pool.firstNumber}`;
  return `#${pool.firstNumber} - #${pool.lastNumber}`;
}

function listingMatches(listing) {
  const query = state.search.trim().toLowerCase();
  const rarityMatches = state.rarity === "all" || listing.rarity === state.rarity;
  if (!rarityMatches) return false;
  if (!query) return true;

  const haystack = [
    listing.name,
    listing.rarity,
    listing.priceLabel,
    listing.nftreeNumber ? `#${listing.nftreeNumber}` : "",
    listing.nftreeNumber || "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function renderSalePoolCard(pool, activePoolId) {
  const isActive = pool.poolId === activePoolId;
  const label = escapeHtml(pool.label || "Sale pool");
  const count = Number(pool.count || 0);
  const status = count > 0 ? `${formatInteger(count)} available` : "Empty";
  const range = escapeHtml(salePoolRange(pool));
  const poolId = escapeHtml(shortId(pool.poolId));
  const description = escapeHtml(pool.description || "NFTree sale pool");

  return `
    <article class="sale-pool-card ${isActive ? "is-active" : ""}">
      <div>
        <span>${label}${isActive ? " active" : ""}</span>
        <strong>${status}</strong>
      </div>
      <p>${description}</p>
      <small>${range} | ${poolId}</small>
    </article>
  `;
}

function renderListingCard(listing) {
  const title = escapeHtml(listing.name || "NFTree");
  const rarity = escapeHtml(listing.rarity || "Unranked");
  const imageUrl = escapeHtml(listing.imageUrl || "");
  const numberLabel = listing.nftreeNumber ? `#${escapeHtml(listing.nftreeNumber)}` : "NFTree";
  const priceLabel = escapeHtml(listing.priceLabel || "Open");
  const link = escapeHtml(listing.tradeportUrl || COLLECTION_URL);

  return `
    <article class="listing-card">
      <div class="listing-media">
        ${imageUrl ? `<img src="${imageUrl}" alt="${title} artwork" loading="lazy" />` : ""}
        <span class="rarity-badge">${rarity}</span>
      </div>
      <div class="listing-body">
        <h3 class="listing-title">${title}</h3>
        <div class="listing-meta">
          <span>${numberLabel}</span>
          <span>${rarity}</span>
        </div>
        <p class="price-line">${priceLabel}</p>
        <a class="button button-secondary" href="${link}" rel="noreferrer" target="_blank">Buy on TradePort</a>
      </div>
    </article>
  `;
}

function applySalePools(payload, live = true) {
  const pools = Array.isArray(payload?.pools) ? payload.pools : [];
  const safePayload = pools.length ? payload : fallbackSalePoolStatus;
  const safePools = pools.length ? pools : fallbackSalePoolStatus.pools;
  const totalAvailable =
    Number(safePayload.totalAvailable) ||
    safePools.reduce((total, pool) => total + Number(pool.count || 0), 0);
  const activePool = safePools.find((pool) => pool.poolId === safePayload.activePoolId) || safePools.find((pool) => Number(pool.count || 0) > 0);

  state.salePoolStatus = {
    ...safePayload,
    pools: safePools,
    totalAvailable,
    activePoolId: activePool?.poolId || "",
    activePoolLabel: activePool?.label || "",
  };

  elements.mintPoolCount.textContent = totalAvailable ? `${formatInteger(totalAvailable)} available` : "No pool inventory";
  elements.salePoolCount.textContent = totalAvailable ? formatInteger(totalAvailable) : "0";
  elements.activePoolLabel.textContent = activePool?.label || "No active pool";
  elements.salePoolGrid.innerHTML = safePools.map((pool) => renderSalePoolCard(pool, activePool?.poolId || "")).join("");

  const priceLabel = formatMistAsSui(safePayload.mintPriceMist || MINT_PRICE_MIST);
  const poolHint = activePool
    ? `${activePool.label} ready | ${priceLabel} mint`
    : "No sale pool with inventory is available right now.";
  elements.mintContractStatus.textContent = live ? poolHint : `Last verified: ${poolHint}`;
}

function renderListings() {
  const visibleListings = state.listings.filter(listingMatches);

  if (!visibleListings.length) {
    elements.listingGrid.innerHTML = `
      <div class="empty-state">
        <strong>No NFTrees match that filter.</strong>
        Adjust the search or open the full TradePort collection.
      </div>
    `;
    return;
  }

  elements.listingGrid.innerHTML = visibleListings.map(renderListingCard).join("");
}

function applyListings(payload) {
  const listings = Array.isArray(payload?.listings) ? payload.listings : [];
  state.listings = listings.length ? listings : fallbackListings;
  elements.listedCount.textContent = listings.length ? String(payload.count ?? listings.length) : "Preview";
  elements.floorPrice.textContent = listings.length ? payload.floorPrice || "Open" : "Open";
  elements.tradeportCollection.href = payload?.collectionUrl || COLLECTION_URL;

  if (listings.length) {
    const when = payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    setStatus(`Showing ${listings.length} active TradePort listing${listings.length === 1 ? "" : "s"}${when ? ` refreshed at ${when}` : ""}.`);
  } else {
    setStatus("Live listing data is not available here yet. Showing featured NFTrees with a direct TradePort path.", true);
  }

  renderListings();
}

async function loadListings() {
  setStatus("Loading current TradePort listings.");
  elements.refreshListings.disabled = true;
  elements.refreshListings.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { headers: { accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || "Listing lookup failed.");
    applyListings(payload);
  } catch (error) {
    applyListings({ listings: [] });
    console.warn(error);
  } finally {
    elements.refreshListings.disabled = false;
    elements.refreshListings.removeAttribute("aria-busy");
  }
}

async function loadSalePools() {
  try {
    const response = await fetch(`${SALE_POOL_API_URL}?t=${Date.now()}`, { headers: { accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || "Sale-pool lookup failed.");
    applySalePools(payload, true);
  } catch (error) {
    applySalePools(fallbackSalePoolStatus, false);
    console.warn(error);
  }
}

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.rarity = button.dataset.rarity || "all";
    document.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("is-active", item === button));
    renderListings();
  });
});

elements.listingSearch.addEventListener("input", (event) => {
  state.search = event.currentTarget.value;
  renderListings();
});

elements.refreshListings.addEventListener("click", loadListings);

elements.walletOptions.forEach((button) => {
  button.addEventListener("click", () => {
    const walletName = button.dataset.wallet || "Selected wallet";
    state.selectedWallet = walletName;

    elements.walletOptions.forEach((option) => {
      const selected = option === button;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    elements.selectedWalletLabel.textContent = walletName;
    elements.walletConnectButton.disabled = false;
    elements.walletConnectButton.textContent = "Connect";
    const activePool = state.salePoolStatus.pools.find((pool) => pool.poolId === state.salePoolStatus.activePoolId);
    const activePoolLabel = activePool?.label || "the active pool";
    elements.walletPickerStatus.textContent = `${walletName} selected. Connect to mint from ${activePoolLabel}.`;
    elements.walletPickerStatus.classList.add("is-ready");
    elements.walletPickerStatus.classList.remove("is-connecting");
  });
});

elements.walletConnectButton.addEventListener("click", async () => {
  if (!state.selectedWallet) return;

  elements.walletConnectButton.disabled = true;
  elements.walletConnectButton.textContent = "Opening...";
  elements.walletPickerStatus.textContent = `Opening ${state.selectedWallet} for a ${formatMistAsSui(state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST)} NFTree mint.`;
  elements.mintContractStatus.textContent = `Mint transaction target: ${shortId(state.salePoolStatus.latestPackageId || LATEST_PACKAGE_ID)}::collection::purchase using ${state.salePoolStatus.activePoolLabel || "an active pool"}.`;
  elements.walletPickerStatus.classList.remove("is-ready");
  elements.walletPickerStatus.classList.add("is-connecting");

  try {
    if (!window.NFTreeWalletMint?.connectAndMint) {
      throw new Error("The NFTree wallet mint module is still loading. Refresh the page and try again.");
    }

    const result = await window.NFTreeWalletMint.connectAndMint({
      walletName: state.selectedWallet,
      salePoolStatus: state.salePoolStatus,
    });

    elements.walletPickerStatus.textContent = `Mint submitted through ${result.walletName}.`;
    elements.mintContractStatus.textContent = `Transaction ${shortId(result.digest)} used ${result.poolLabel}. Your NFTree should appear after the transaction confirms.`;
    elements.walletPickerStatus.classList.add("is-ready");
    await loadSalePools();
  } catch (error) {
    elements.walletPickerStatus.textContent = error instanceof Error ? error.message : "Wallet mint was not completed.";
    elements.mintContractStatus.textContent = error?.digest
      ? `Transaction ${shortId(error.digest)} was submitted but did not mint an NFTree. No NFT was created.`
      : "No mint transaction was completed.";
  } finally {
    elements.walletConnectButton.disabled = false;
    elements.walletConnectButton.textContent = "Connect";
    elements.walletPickerStatus.classList.remove("is-connecting");
  }
});

loadSalePools();
loadListings();
