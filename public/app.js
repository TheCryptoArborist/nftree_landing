const API_URL = "/api/nftree-listings";
const SALE_POOL_API_URL = "/api/nftree-sale-pools";
const COLLECTION_URL =
  "https://www.tradeport.xyz/sui/collection/0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT?tab=items";
const LATEST_PACKAGE_ID = "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5";
const MINT_CONFIG_ID = "0xe83616020f61f73b30c40fd3f888ed397626afd071bd4666374c306d8e98b06b";
const MINT_PRICE_MIST = "25000000000";
const GAS_WARNING_BUFFER_MIST = "100000000";
const DEBUG_MINT = new URLSearchParams(window.location.search).get("debugMint") === "1";
const MINT_MESSAGES = Object.freeze({
  walletDisconnected: "Wallet disconnected.",
  connectBeforeMinting: "Connect a Sui wallet before minting.",
  mintPreview25Sui: "You are about to mint 1 NFTree for 25 SUI.",
  checkingBalance: "Checking SUI balance.",
  balanceUnavailable: "Could not confirm SUI balance. You may still try minting.",
  gasWarning: "You have 25 SUI, but may need extra SUI for gas.",
  salePoolFailed: "Sale pool data failed to load.",
  noActivePool: "No active NFTree sale pool found.",
  insufficientSui: "Insufficient SUI for NFTree mint. You need 25 SUI plus gas.",
  walletSigningCancelled: "Wallet signing was cancelled.",
  unsupportedSigning: "Wallet does not support Sui transaction signing.",
});

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
  wallets: [],
  selectedWallet: "",
  connectedWallet: "",
  connectedAddress: "",
  balanceAccount: "",
  balanceBranch: "idle",
  balanceError: "",
  balanceLabel: "",
  balanceMist: "",
  balanceRequestId: 0,
  balanceStatus: "idle",
  isConnecting: false,
  isDisconnecting: false,
  isMinting: false,
  salePoolsLoaded: false,
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
  saleMintNowButton: document.querySelector("#saleMintNowButton"),
  tradeportCollection: document.querySelector("#tradeportCollection"),
  selectedWalletLabel: document.querySelector("#selectedWalletLabel"),
  walletBalanceSummary: document.querySelector("#walletBalanceSummary"),
  walletConnectedSummary: document.querySelector("#walletConnectedSummary"),
  walletConnectButton: document.querySelector("#walletConnectButton"),
  walletDisconnectButton: document.querySelector("#walletDisconnectButton"),
  walletOptions: document.querySelector("#walletOptions"),
  walletPickerStatus: document.querySelector("#walletPickerStatus"),
  walletPickerModal: document.querySelector("#walletPickerModal"),
  walletModalOptions: document.querySelector("#walletModalOptions"),
  walletModalStatus: document.querySelector("#walletModalStatus"),
  walletModalDialog: document.querySelector(".wallet-dialog"),
  mintSection: document.querySelector("#mint"),
  mintFocusCard: document.querySelector("#mintFlow"),
  mintRouteLinks: document.querySelectorAll("[data-mint-route-link]"),
  mintTriggers: document.querySelectorAll("[data-mint-trigger]"),
};

let walletChangeUnsubscribe = () => {};
let mintRouteFocusTimeout = 0;

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

function shortenAddress(address) {
  const value = String(address || "");
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function errorDebugDetails(error) {
  if (!error) return {};
  return {
    name: error.name || "",
    message: error.message || String(error),
    code: error.code || "",
    cause: error.cause ? String(error.cause?.message || error.cause) : "",
    stack: error.stack || "",
    digest: error.digest || "",
  };
}

function debugMint(label, details = {}) {
  if (!DEBUG_MINT) return;
  console.info("[NFTree mint debug]", label, details);
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

function mistBigInt(value) {
  try {
    return BigInt(String(value || "0"));
  } catch {
    return 0n;
  }
}

function mintPreviewMessage(priceLabel) {
  return priceLabel === "25 SUI" ? MINT_MESSAGES.mintPreview25Sui : `You are about to mint 1 NFTree for ${priceLabel}.`;
}

function suiExplorerTxUrl(digest) {
  return `https://suiexplorer.com/txblock/${encodeURIComponent(digest)}?network=mainnet`;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isMintRoute(pathname = window.location.pathname) {
  return pathname.replace(/\/+$/, "") === "/mint";
}

function focusMintSection({ updateHash = false } = {}) {
  const section = elements.mintSection;
  const focusTarget = elements.mintFocusCard || section;
  if (!section || !focusTarget) return;

  if (updateHash && window.location.hash !== "#mint") {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#mint`);
  }

  window.requestAnimationFrame(() => {
    focusTarget.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    window.clearTimeout(mintRouteFocusTimeout);
    focusTarget.classList.remove("is-route-focused");
    window.requestAnimationFrame(() => {
      focusTarget.classList.add("is-route-focused");
      mintRouteFocusTimeout = window.setTimeout(() => focusTarget.classList.remove("is-route-focused"), 1800);
    });
  });
}

function focusMintRouteIfNeeded() {
  if (isMintRoute()) {
    focusMintSection({ updateHash: window.location.hash !== "#mint" });
  }
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
  const loadError = payload?.error ? String(payload.error) : "";
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
  state.salePoolsLoaded = true;

  elements.mintPoolCount.textContent = totalAvailable ? `${formatInteger(totalAvailable)} available` : "No pool inventory";
  elements.salePoolCount.textContent = totalAvailable ? formatInteger(totalAvailable) : "0";
  elements.activePoolLabel.textContent = activePool?.label || "No active pool";
  elements.salePoolGrid.innerHTML = safePools.map((pool) => renderSalePoolCard(pool, activePool?.poolId || "")).join("");

  const priceLabel = formatMistAsSui(safePayload.mintPriceMist || MINT_PRICE_MIST);
  const poolHint = activePool
    ? `${activePool.label} ready | ${priceLabel} mint`
    : "No sale pool with inventory is available right now.";
  elements.mintContractStatus.textContent = live
    ? poolHint
    : `${MINT_MESSAGES.salePoolFailed} Last verified: ${poolHint}`;
  debugMint("Active sale pool selected", {
    live,
    loadError,
    totalAvailable,
    activePoolId: activePool?.poolId || "",
    activePoolLabel: activePool?.label || "",
    mintConfigId: state.salePoolStatus.mintConfigId || "",
    mintPriceMist: state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST,
    transactionTarget: `${state.salePoolStatus.latestPackageId || LATEST_PACKAGE_ID}::collection::purchase`,
  });
  updateMintButtons();
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
    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text();
    let payload = {};

    if (!contentType.toLowerCase().includes("application/json")) {
      debugMint("Sale pool API returned non-JSON", {
        status: response.status,
        contentType,
        bodyStart: bodyText.slice(0, 240),
      });
      throw new Error(MINT_MESSAGES.salePoolFailed);
    }

    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch (error) {
      debugMint("Sale pool API JSON parse failed", errorDebugDetails(error));
      throw new Error(MINT_MESSAGES.salePoolFailed);
    }

    debugMint("Sale pool API response", {
      status: response.status,
      ok: response.ok,
      contentType,
      payload,
    });

    if (!response.ok || payload.error) throw new Error(payload.error || MINT_MESSAGES.salePoolFailed);
    applySalePools(payload, true);
  } catch (error) {
    debugMint("Sale pool API failed", errorDebugDetails(error));
    applySalePools({ ...fallbackSalePoolStatus, error: error?.message || MINT_MESSAGES.salePoolFailed }, false);
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

function walletInitial(walletName) {
  const compact = String(walletName || "Wallet").replace(/\s+wallet\b/i, "").trim();
  if (/^sui$/i.test(compact)) return "SUI";
  return compact.slice(0, 2).toUpperCase() || "W";
}

function walletIconMarkup(wallet) {
  const walletName = String(wallet?.name || "Sui wallet");
  const walletIcon = typeof wallet?.icon === "string" ? wallet.icon.trim() : "";
  const initial = walletInitial(walletName);

  if (!walletIcon) {
    return `<span class="wallet-icon wallet-icon-fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
  }

  return `
    <span class="wallet-icon wallet-icon-image" aria-hidden="true" data-wallet-initial="${escapeHtml(initial)}">
      <img src="${escapeHtml(walletIcon)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
    </span>
  `;
}

function activateWalletIconFallbacks(container) {
  container?.querySelectorAll(".wallet-icon-image img").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const icon = image.closest(".wallet-icon-image");
        if (!icon) return;
        icon.classList.remove("wallet-icon-image");
        icon.classList.add("wallet-icon-fallback");
        icon.textContent = icon.dataset.walletInitial || "W";
      },
      { once: true },
    );
  });
}

function walletErrorMessage(error, fallback) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/reject|denied|cancel|closed/i.test(message)) {
    return "Wallet connection was rejected. No mint transaction was started.";
  }
  if (/not detected/i.test(message)) {
    return "That Sui wallet was not detected in this browser.";
  }
  return message || fallback;
}

function mintErrorMessage(error, fallback) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/reject|denied|cancel|closed/i.test(message)) {
    return `${MINT_MESSAGES.walletSigningCancelled} No mint transaction was submitted.`;
  }
  if (/not connected/i.test(message)) {
    return MINT_MESSAGES.connectBeforeMinting;
  }
  if (error?.code === "NFTREE_INSUFFICIENT_SUI" || /InsufficientCoinBalance|does not have enough|split across smaller/i.test(message)) {
    return message ? `${MINT_MESSAGES.insufficientSui} ${message}` : MINT_MESSAGES.insufficientSui;
  }
  if (/does not support|cannot mint|cannot submit|incompatible/i.test(message)) {
    return `${MINT_MESSAGES.unsupportedSigning} Switch to a Sui wallet that supports transaction signing.`;
  }
  return message || fallback;
}

function getWalletModule() {
  if (!window.NFTreeWalletMint) {
    throw new Error("The NFTree wallet module is still loading. Refresh the page and try again.");
  }
  return window.NFTreeWalletMint;
}

function setWalletStatus(message, mode = "") {
  elements.walletPickerStatus.textContent = message;
  elements.walletPickerStatus.classList.toggle("is-ready", mode === "ready");
  elements.walletPickerStatus.classList.toggle("is-connecting", mode === "connecting");
  elements.walletPickerStatus.classList.toggle("is-error", mode === "error");
}

function setModalStatus(message, mode = "") {
  elements.walletModalStatus.textContent = message;
  elements.walletModalStatus.classList.toggle("is-error", mode === "error");
  elements.walletModalStatus.classList.toggle("is-ready", mode === "ready");
}

function activeSalePool() {
  const pools = Array.isArray(state.salePoolStatus?.pools) ? state.salePoolStatus.pools : [];
  return (
    pools.find((pool) => pool.poolId === state.salePoolStatus.activePoolId && Number(pool.count || 0) > 0) ||
    pools.find((pool) => Number(pool.count || 0) > 0)
  );
}

function classifySuiBalance(balanceMist) {
  const balance = mistBigInt(balanceMist);
  const mintPrice = mistBigInt(state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST);
  const gasBuffer = mistBigInt(GAS_WARNING_BUFFER_MIST);
  const balanceSui = formatMistAsSui(balance);
  let branch = "enough";
  let message = `SUI balance: ${balanceSui}.`;
  let blockedByInsufficientFunds = false;

  if (balance < mintPrice) {
    branch = "insufficient";
    message = `SUI balance: ${balanceSui}. ${MINT_MESSAGES.insufficientSui}`;
    blockedByInsufficientFunds = true;
  } else if (balance < mintPrice + gasBuffer) {
    branch = "gas-warning";
    message = `SUI balance: ${balanceSui}. ${MINT_MESSAGES.gasWarning}`;
  }

  return {
    balanceMist: balance.toString(),
    balanceSui,
    blockedByInsufficientFunds,
    branch,
    message,
    mintPriceMist: mintPrice.toString(),
  };
}

function balanceDebugState() {
  return {
    connectedWallet: state.connectedWallet,
    accountAddress: state.balanceAccount || state.connectedAddress,
    balanceStatus: state.balanceStatus,
    balanceBranch: state.balanceBranch,
    balanceMist: state.balanceMist,
    balanceSui: state.balanceLabel,
    mintPriceMist: state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST,
    gasWarningBufferMist: GAS_WARNING_BUFFER_MIST,
    blockedByInsufficientFunds: state.balanceStatus === "insufficient",
  };
}

function currentBalanceState() {
  return {
    ...balanceDebugState(),
    readyToAttemptMint:
      !state.connectedAddress ||
      state.balanceStatus === "enough" ||
      state.balanceStatus === "gas-warning" ||
      state.balanceStatus === "unknown",
  };
}

function renderBalanceState() {
  const element = elements.walletBalanceSummary;
  if (!element) return;

  element.classList.remove("is-ready", "is-warning", "is-error");

  if (!state.connectedAddress || state.balanceStatus === "idle") {
    element.textContent = "";
    element.hidden = true;
    return;
  }

  element.hidden = false;

  if (state.balanceStatus === "loading") {
    element.textContent = MINT_MESSAGES.checkingBalance;
    element.classList.add("is-warning");
    return;
  }

  if (state.balanceStatus === "unknown") {
    element.textContent = MINT_MESSAGES.balanceUnavailable;
    element.classList.add("is-warning");
    return;
  }

  if (state.balanceStatus === "insufficient") {
    element.textContent = `SUI balance: ${state.balanceLabel || "0 SUI"}. ${MINT_MESSAGES.insufficientSui}`;
    element.classList.add("is-error");
    return;
  }

  if (state.balanceStatus === "gas-warning") {
    element.textContent = `SUI balance: ${state.balanceLabel}. ${MINT_MESSAGES.gasWarning}`;
    element.classList.add("is-warning");
    return;
  }

  element.textContent = `SUI balance: ${state.balanceLabel}.`;
  element.classList.add("is-ready");
}

function clearBalanceState() {
  state.balanceRequestId += 1;
  state.balanceAccount = "";
  state.balanceBranch = "idle";
  state.balanceError = "";
  state.balanceLabel = "";
  state.balanceMist = "";
  state.balanceStatus = "idle";
  renderBalanceState();
}

async function refreshConnectedBalance() {
  const accountAddress = state.connectedAddress;
  const walletName = state.connectedWallet;
  if (!accountAddress) {
    clearBalanceState();
    updateMintButtons();
    return;
  }

  const requestId = state.balanceRequestId + 1;
  state.balanceRequestId = requestId;
  state.balanceAccount = accountAddress;
  state.balanceBranch = "loading";
  state.balanceError = "";
  state.balanceLabel = "";
  state.balanceMist = "";
  state.balanceStatus = "loading";
  renderBalanceState();
  updateMintButtons();
  debugMint("SUI balance check started", {
    connectedWallet: walletName,
    accountAddress,
    mintPriceMist: state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST,
  });

  try {
    const walletModule = getWalletModule();
    if (typeof walletModule.getSuiBalance !== "function") {
      throw new Error("NFTree wallet balance reader is not available.");
    }

    const balance = await walletModule.getSuiBalance({ accountAddress });
    if (requestId !== state.balanceRequestId || accountAddress !== state.connectedAddress) return;

    const classified = classifySuiBalance(balance.balanceMist);
    state.balanceAccount = accountAddress;
    state.balanceBranch = classified.branch;
    state.balanceError = "";
    state.balanceLabel = classified.balanceSui;
    state.balanceMist = classified.balanceMist;
    state.balanceStatus = classified.branch === "gas-warning" ? "gas-warning" : classified.branch;
    debugMint("SUI balance check completed", {
      connectedWallet: walletName,
      accountAddress,
      balanceMist: classified.balanceMist,
      balanceSui: classified.balanceSui,
      mintPriceMist: classified.mintPriceMist,
      balanceBranch: classified.branch,
      blockedByInsufficientFunds: classified.blockedByInsufficientFunds,
    });
  } catch (error) {
    if (requestId !== state.balanceRequestId || accountAddress !== state.connectedAddress) return;

    state.balanceAccount = accountAddress;
    state.balanceBranch = "unknown";
    state.balanceError = error?.message || String(error || "");
    state.balanceLabel = "";
    state.balanceMist = "";
    state.balanceStatus = "unknown";
    debugMint("SUI balance check failed", {
      connectedWallet: walletName,
      accountAddress,
      mintPriceMist: state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST,
      balanceBranch: "unknown",
      blockedByInsufficientFunds: false,
      error: errorDebugDetails(error),
    });
  } finally {
    if (requestId === state.balanceRequestId && accountAddress === state.connectedAddress) {
      renderBalanceState();
      updateMintButtons();
    }
  }
}

function getActiveSigningState() {
  const displayConnected = Boolean(state.connectedWallet && state.connectedAddress);
  const fallback = {
    accountAddress: state.connectedAddress,
    accountExists: displayConnected,
    canSign: displayConnected,
    walletExists: displayConnected,
    walletName: state.connectedWallet,
  };

  try {
    const walletModule = window.NFTreeWalletMint;
    if (typeof walletModule?.getConnectedWalletState !== "function") {
      return {
        displayConnected,
        moduleState: fallback,
        signingAccountAddress: state.connectedAddress,
        signingReady: displayConnected,
        signingStateSource: "ui-fallback",
        signingWalletName: state.connectedWallet,
      };
    }

    const moduleState = walletModule.getConnectedWalletState({
      walletName: state.connectedWallet,
      accountAddress: state.connectedAddress,
    });

    return {
      displayConnected,
      moduleState,
      signingAccountAddress: moduleState.accountAddress || state.connectedAddress,
      signingReady: displayConnected && moduleState.walletExists && moduleState.accountExists && moduleState.canSign,
      signingStateSource: "wallet-module",
      signingWalletName: moduleState.walletName || state.connectedWallet,
    };
  } catch (error) {
    debugMint("Active signing state lookup failed", errorDebugDetails(error));
    return {
      displayConnected,
      moduleState: fallback,
      signingAccountAddress: state.connectedAddress,
      signingReady: displayConnected,
      signingStateSource: "ui-fallback-after-error",
      signingWalletName: state.connectedWallet,
    };
  }
}

function mintReadiness() {
  if (state.isMinting) {
    return { ready: false, state: "pending", message: "NFTree mint transaction is pending in your wallet." };
  }

  if (!state.salePoolsLoaded) {
    return { ready: false, state: "loading", message: "Sale pool inventory is still loading. Try Mint Now again in a moment." };
  }

  const pool = activeSalePool();
  const totalAvailable = Number(state.salePoolStatus.totalAvailable || 0);
  if (!pool) {
    return { ready: false, state: "sold-out", message: MINT_MESSAGES.noActivePool };
  }

  if (totalAvailable <= 0) {
    return { ready: false, state: "sold-out", message: "NFTree sale pools are sold out right now." };
  }

  return { ready: true, state: "ready", message: "Mint ready." };
}

function updateMintButtons() {
  const readiness = mintReadiness();
  const signingState = getActiveSigningState();
  const balanceState = currentBalanceState();
  const priceLabel = formatMistAsSui(state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST);
  elements.mintTriggers.forEach((trigger) => {
    const balanceBlocksMint =
      signingState.displayConnected &&
      (balanceState.balanceStatus === "loading" || balanceState.blockedByInsufficientFunds);
    const disabled = !readiness.ready || balanceBlocksMint;
    trigger.classList.toggle("is-disabled", disabled);
    trigger.setAttribute("aria-disabled", disabled ? "true" : "false");
    trigger.dataset.mintState = readiness.state;
    trigger.dataset.balanceState = balanceState.balanceStatus || "idle";
    trigger.dataset.balanceBlocksMint = balanceBlocksMint ? "true" : "false";
    trigger.dataset.walletConnected = signingState.displayConnected ? "true" : "false";
    trigger.dataset.signingReady = signingState.signingReady ? "true" : "false";
    trigger.title = balanceBlocksMint
      ? (balanceState.balanceStatus === "loading" ? MINT_MESSAGES.checkingBalance : MINT_MESSAGES.insufficientSui)
      : (disabled ? readiness.message : "");

    if (state.isMinting) {
      trigger.textContent = "Minting...";
    } else if (signingState.displayConnected && balanceState.balanceStatus === "loading") {
      trigger.textContent = "Checking SUI balance";
    } else if (signingState.displayConnected && balanceState.blockedByInsufficientFunds) {
      trigger.textContent = "Insufficient SUI for mint";
    } else if (!readiness.ready && readiness.state === "loading") {
      trigger.textContent = "Checking sale pools";
    } else if (!readiness.ready) {
      trigger.textContent = readiness.message;
    } else if (signingState.displayConnected) {
      trigger.textContent = `Mint NFTree for ${priceLabel}`;
    } else {
      trigger.textContent = "Choose wallet and mint";
    }
  });
}

function renderWalletState() {
  const isConnected = Boolean(state.connectedAddress && state.connectedWallet);
  const connectedText = isConnected
    ? `Connected: ${shortenAddress(state.connectedAddress)}`
    : "";
  const walletLabel = isConnected ? `${state.connectedWallet} / ${shortenAddress(state.connectedAddress)}` : "";

  if (isConnected) {
    elements.selectedWalletLabel.textContent = walletLabel;
    elements.walletConnectedSummary.textContent = connectedText;
    elements.walletConnectedSummary.hidden = false;
    elements.walletDisconnectButton.hidden = false;
    elements.walletDisconnectButton.disabled = state.isDisconnecting || state.isMinting;
    renderBalanceState();
    return;
  }

  elements.walletConnectedSummary.textContent = "";
  elements.walletConnectedSummary.hidden = true;
  elements.walletDisconnectButton.hidden = true;
  elements.walletDisconnectButton.disabled = true;
  renderBalanceState();

  if (!state.wallets.length) {
    elements.selectedWalletLabel.textContent = "No wallet detected";
  } else {
    elements.selectedWalletLabel.textContent = "No wallet selected";
  }
}

function updateWalletButton() {
  if (state.isConnecting) {
    elements.walletConnectButton.textContent = "Connecting...";
    elements.walletConnectButton.disabled = true;
    return;
  }

  if (state.isDisconnecting) {
    elements.walletConnectButton.textContent = "Disconnecting...";
    elements.walletConnectButton.disabled = true;
    return;
  }

  if (state.isMinting) {
    elements.walletConnectButton.textContent = "Minting...";
    elements.walletConnectButton.disabled = true;
    return;
  }

  elements.walletConnectButton.textContent = state.connectedAddress ? "Connected" : "Connect";
  elements.walletConnectButton.disabled = Boolean(state.connectedAddress);
}

function setWallets(wallets) {
  state.wallets = Array.isArray(wallets) ? wallets : [];
  renderCompactWalletOptions();
  renderWalletModalOptions();

  if (!state.connectedAddress && !state.wallets.length) {
    setWalletStatus("No Sui wallet detected. Install or unlock a Sui wallet, then try again.", "error");
  } else if (!state.connectedAddress) {
    setWalletStatus("Choose a Sui wallet before minting.");
  }

  renderWalletState();
  updateWalletButton();
  updateMintButtons();
}

function refreshWallets() {
  try {
    const walletModule = getWalletModule();
    const wallets = typeof walletModule.availableWallets === "function"
      ? walletModule.availableWallets()
      : (walletModule.availableWalletNames?.() || []).map((name) => ({ name }));
    setWallets(wallets);
  } catch (error) {
    setWallets([]);
    setWalletStatus(walletErrorMessage(error, "Wallet detection is not ready yet."), "error");
  }
}

function renderCompactWalletOptions() {
  if (!elements.walletOptions) return;

  if (!state.wallets.length) {
    elements.walletOptions.innerHTML = `
      <button class="wallet-option wallet-option-empty" type="button" aria-pressed="false">
        <span class="wallet-icon wallet-icon-fallback" aria-hidden="true">?</span>
        <span>No wallet</span>
      </button>
    `;
    return;
  }

  elements.walletOptions.innerHTML = state.wallets
    .slice(0, 4)
    .map((wallet) => {
      const selected = wallet.name === state.selectedWallet || wallet.name === state.connectedWallet;
      const walletName = String(wallet.name || "Sui wallet");
      return `
        <button class="wallet-option ${selected ? "is-selected" : ""}" type="button" data-wallet="${escapeHtml(walletName)}" aria-pressed="${selected ? "true" : "false"}">
          ${walletIconMarkup(wallet)}
          <span>${escapeHtml(walletName.replace(/\s+wallet\b/i, ""))}</span>
        </button>
      `;
    })
    .join("");
  activateWalletIconFallbacks(elements.walletOptions);
}

function renderWalletModalOptions() {
  if (!elements.walletModalOptions) return;

  if (!state.wallets.length) {
    elements.walletModalOptions.innerHTML = `
      <div class="wallet-empty-state" role="status">
        <strong>No Sui wallet detected</strong>
        <p>Install or unlock a Sui-compatible wallet, then reopen this picker.</p>
      </div>
    `;
    setModalStatus("No Sui wallet detected in this browser.", "error");
    return;
  }

  elements.walletModalOptions.innerHTML = state.wallets
    .map((wallet) => {
      const walletName = String(wallet.name || "Sui wallet");
      return `
      <button class="wallet-modal-option ${walletName === state.selectedWallet ? "is-selected" : ""}" type="button" data-wallet="${escapeHtml(walletName)}">
        ${walletIconMarkup(wallet)}
        <span>${escapeHtml(walletName)}</span>
      </button>
    `;
    })
    .join("");
  activateWalletIconFallbacks(elements.walletModalOptions);
}

function openWalletPicker(walletName = "") {
  refreshWallets();
  if (walletName) state.selectedWallet = walletName;
  renderCompactWalletOptions();
  renderWalletModalOptions();

  if (state.wallets.length) {
    setModalStatus("Choose the Sui wallet to connect. Minting will not start until you press Mint after connecting.");
  }

  elements.walletPickerModal.hidden = false;
  elements.walletModalDialog?.focus();
}

function openWalletPickerForMint() {
  openWalletPicker();
  setWalletStatus(MINT_MESSAGES.connectBeforeMinting, "error");
  if (state.wallets.length) {
    setModalStatus(`${MINT_MESSAGES.connectBeforeMinting} Minting will not start until you press Mint Now after connecting.`);
  }
}

function closeWalletPicker() {
  elements.walletPickerModal.hidden = true;
}

function clearConnectedWalletState() {
  walletChangeUnsubscribe?.();
  walletChangeUnsubscribe = () => {};
  state.connectedWallet = "";
  state.connectedAddress = "";
  state.selectedWallet = "";
  clearBalanceState();
}

function subscribeToConnectedWallet() {
  walletChangeUnsubscribe?.();
  walletChangeUnsubscribe = () => {};

  const walletModule = window.NFTreeWalletMint;
  if (typeof walletModule?.onConnectedWalletChange !== "function" || !state.connectedWallet || !state.connectedAddress) {
    return;
  }

  walletChangeUnsubscribe = walletModule.onConnectedWalletChange(
    {
      walletName: state.connectedWallet,
      accountAddress: state.connectedAddress,
    },
    (event) => {
      if (!event?.connected) {
        clearConnectedWalletState();
        renderWalletState();
        updateWalletButton();
        updateMintButtons();
        renderCompactWalletOptions();
        renderWalletModalOptions();
        setWalletStatus(MINT_MESSAGES.walletDisconnected, "ready");
        elements.mintContractStatus.textContent = MINT_MESSAGES.walletDisconnected;
        return;
      }

      state.connectedWallet = event.walletName || state.connectedWallet;
      state.connectedAddress = event.account || state.connectedAddress;
      state.selectedWallet = state.connectedWallet;
      renderWalletState();
      refreshConnectedBalance();
      updateWalletButton();
      updateMintButtons();
      renderCompactWalletOptions();
      renderWalletModalOptions();
      setWalletStatus(`Connected to ${state.connectedWallet}: ${shortenAddress(state.connectedAddress)}.`, "ready");
    },
  );
}

async function connectWallet(walletName) {
  state.selectedWallet = walletName;
  state.isConnecting = true;
  updateWalletButton();
  renderWalletState();
  renderCompactWalletOptions();
  renderWalletModalOptions();
  setWalletStatus(`Opening ${walletName} to connect.`, "connecting");
  setModalStatus(`Opening ${walletName}.`, "ready");
  debugMint("Connect wallet selected", {
    walletName,
    connectedWallet: state.connectedWallet,
    connectedAddress: state.connectedAddress,
  });

  try {
    const walletModule = getWalletModule();
    if (typeof walletModule.connectWallet !== "function") {
      throw new Error("The NFTree wallet module does not expose a connect function yet. Refresh the page and try again.");
    }

    const result = await walletModule.connectWallet({ walletName });
    state.connectedWallet = result.walletName;
    state.connectedAddress = result.account;
    state.selectedWallet = result.walletName;
    subscribeToConnectedWallet();
    renderWalletState();
    refreshConnectedBalance();
    setWalletStatus(`Connected to ${result.walletName}: ${shortenAddress(result.account)}. Press Mint NFTree to submit a transaction.`, "ready");
    setModalStatus(`Connected to ${shortenAddress(result.account)}. Close this picker and press Mint NFTree when ready.`, "ready");
    elements.mintContractStatus.textContent = `Connected: ${shortenAddress(result.account)}. Minting is ready but no transaction has been submitted.`;
    closeWalletPicker();
    debugMint("Wallet connected", {
      walletName: result.walletName,
      account: result.account,
      connectOnly: true,
    });
  } catch (error) {
    const message = walletErrorMessage(error, "Wallet connection was not completed.");
    debugMint("Wallet connection failed", errorDebugDetails(error));
    setWalletStatus(message, "error");
    setModalStatus(message, "error");
    elements.mintContractStatus.textContent = "No mint transaction was completed.";
  } finally {
    state.isConnecting = false;
    renderWalletState();
    updateWalletButton();
    updateMintButtons();
    renderCompactWalletOptions();
    renderWalletModalOptions();
  }
}

async function disconnectWallet() {
  const walletName = state.connectedWallet;
  const accountAddress = state.connectedAddress;
  debugMint("Disconnect wallet clicked", { walletName, accountAddress });

  state.isDisconnecting = true;
  renderWalletState();
  updateWalletButton();
  updateMintButtons();

  try {
    const walletModule = window.NFTreeWalletMint;
    if (typeof walletModule?.disconnectWallet === "function" && (walletName || accountAddress)) {
      await walletModule.disconnectWallet({ walletName, accountAddress });
    }
  } catch (error) {
    debugMint("Wallet disconnect failed; clearing local state", errorDebugDetails(error));
    console.warn("NFTree wallet disconnect failed; clearing local wallet state.", error);
  } finally {
    clearConnectedWalletState();
    state.isDisconnecting = false;
    closeWalletPicker();
    renderWalletState();
    updateWalletButton();
    updateMintButtons();
    renderCompactWalletOptions();
    renderWalletModalOptions();
    setWalletStatus(MINT_MESSAGES.walletDisconnected, "ready");
    elements.mintContractStatus.textContent = MINT_MESSAGES.walletDisconnected;
  }
}

async function mintConnectedWallet() {
  const signingState = getActiveSigningState();
  const pool = activeSalePool();
  debugMint("Mint flow started", {
    activePoolId: pool?.poolId || "",
    connectedWallet: state.connectedWallet,
    connectedAddress: state.connectedAddress,
    displayConnected: signingState.displayConnected,
    moduleState: signingState.moduleState,
    salePoolsLoaded: state.salePoolsLoaded,
    selectedAccountAddress: signingState.signingAccountAddress,
    selectedWalletName: signingState.signingWalletName,
    signingReady: signingState.signingReady,
    signingStateSource: signingState.signingStateSource,
    balance: balanceDebugState(),
  });
  const readiness = mintReadiness();
  if (!readiness.ready) {
    debugMint("Mint branch: blocked -> readiness", {
      reason: readiness.message,
      readiness,
      salePoolsLoaded: state.salePoolsLoaded,
      activePoolId: pool?.poolId || "",
    });
    setWalletStatus(readiness.message, readiness.state === "pending" ? "connecting" : "error");
    elements.mintContractStatus.textContent = readiness.message;
    return;
  }

  if (!signingState.displayConnected) {
    debugMint("Mint branch: disconnected -> open picker", {
      connectedWallet: state.connectedWallet,
      connectedAddress: state.connectedAddress,
      moduleState: signingState.moduleState,
    });
    openWalletPickerForMint();
    return;
  }

  const balanceState = currentBalanceState();
  if (balanceState.balanceStatus === "loading") {
    debugMint("Mint branch: blocked -> balance loading", {
      ...balanceState,
      activePoolId: pool?.poolId || "",
    });
    setWalletStatus(MINT_MESSAGES.checkingBalance, "connecting");
    elements.mintContractStatus.textContent = MINT_MESSAGES.checkingBalance;
    updateMintButtons();
    return;
  }

  if (balanceState.blockedByInsufficientFunds) {
    debugMint("Mint branch: blocked -> insufficient balance", {
      ...balanceState,
      activePoolId: pool?.poolId || "",
    });
    setWalletStatus(MINT_MESSAGES.insufficientSui, "error");
    elements.mintContractStatus.textContent =
      `SUI balance: ${balanceState.balanceSui || "0 SUI"}. ${MINT_MESSAGES.insufficientSui}`;
    updateMintButtons();
    return;
  }

  if (!signingState.signingReady) {
    debugMint("Mint branch: connected -> preview with signing-state warning", {
      connectedWallet: state.connectedWallet,
      connectedAddress: state.connectedAddress,
      moduleState: signingState.moduleState,
      balance: balanceState,
    });
  } else {
    debugMint("Mint branch: connected -> preview", {
      connectedWallet: state.connectedWallet,
      connectedAddress: state.connectedAddress,
      moduleState: signingState.moduleState,
      balance: balanceState,
    });
  }

  const priceLabel = formatMistAsSui(state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST);
  const previewMessage = mintPreviewMessage(priceLabel);
  state.isMinting = true;
  renderWalletState();
  updateWalletButton();
  updateMintButtons();
  setWalletStatus(previewMessage, "connecting");
  elements.mintContractStatus.textContent = previewMessage;
  debugMint("Mint preview shown", {
    message: previewMessage,
    walletName: signingState.signingWalletName || state.connectedWallet,
    accountAddress: signingState.signingAccountAddress || state.connectedAddress,
    walletChains: "See NFTree wallet bundle debug log for detected chains.",
    walletFeatures: "See NFTree wallet bundle debug log for detected features.",
    activePoolId: pool?.poolId || "",
    activePoolLabel: pool?.label || "",
    mintConfigId: state.salePoolStatus.mintConfigId || MINT_CONFIG_ID,
    mintPriceMist: state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST,
    transactionTarget: `${state.salePoolStatus.latestPackageId || LATEST_PACKAGE_ID}::collection::purchase`,
    balance: balanceState,
  });
  await nextFrame();
  await wait(450);

  try {
    const walletModule = getWalletModule();
    if (typeof walletModule.mintWithConnectedWallet !== "function") {
      throw new Error("The NFTree wallet module cannot mint with the connected wallet yet. Refresh the page and try again.");
    }

    const result = await walletModule.mintWithConnectedWallet({
      walletName: signingState.signingWalletName || state.connectedWallet,
      accountAddress: signingState.signingAccountAddress || state.connectedAddress,
      salePoolStatus: state.salePoolStatus,
    });

    const digest = String(result.digest || "");
    const explorerUrl = suiExplorerTxUrl(digest);
    const successMessage =
      `Mint succeeded. Transaction digest: ${escapeHtml(digest)}. ` +
      `<a href="${escapeHtml(explorerUrl)}" target="_blank" rel="noreferrer">View on Sui Explorer</a>`;
    await loadSalePools();
    refreshConnectedBalance();
    setWalletStatus(`Mint succeeded through ${result.walletName}.`, "ready");
    elements.mintContractStatus.innerHTML = successMessage;
    debugMint("Mint transaction succeeded", {
      digest,
      explorerUrl,
      walletName: result.walletName,
      poolId: result.poolId || "",
    });
  } catch (error) {
    const message = mintErrorMessage(error, "Wallet mint was not completed.");
    debugMint("Mint transaction failed", errorDebugDetails(error));
    setWalletStatus(message, "error");
    elements.mintContractStatus.textContent = error?.digest
      ? `Transaction ${shortId(error.digest)} was submitted but did not mint an NFTree. ${message}`
      : message;
  } finally {
    state.isMinting = false;
    renderWalletState();
    updateWalletButton();
    updateMintButtons();
  }
}

elements.walletOptions.addEventListener("click", (event) => {
  const button = event.target.closest(".wallet-option");
  if (!button) return;
  openWalletPicker(button.dataset.wallet || "");
});

elements.mintTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    const signingState = getActiveSigningState();
    const readiness = mintReadiness();
    const pool = activeSalePool();
    const balanceState = currentBalanceState();
    debugMint("Mint button clicked", {
      activePoolId: pool?.poolId || "",
      id: trigger.id || "",
      label: trigger.textContent.trim().replace(/\s+/g, " "),
      href: trigger.getAttribute("href") || "",
      mintState: trigger.dataset.mintState || "",
      salePoolLoaded: state.salePoolsLoaded,
      selectedAccountAddress: signingState.signingAccountAddress,
      selectedWalletName: signingState.signingWalletName,
      signingModuleState: signingState.moduleState,
      signingReady: signingState.signingReady,
      uiDisplayConnected: signingState.displayConnected,
      connectedWallet: state.connectedWallet,
      connectedAddress: state.connectedAddress,
      balance: balanceState,
      expectedBranch: !readiness.ready
        ? `blocked -> ${readiness.message}`
        : signingState.displayConnected && balanceState.balanceStatus === "loading"
          ? "blocked -> balance loading"
          : signingState.displayConnected && balanceState.blockedByInsufficientFunds
            ? "blocked -> insufficient balance"
        : signingState.displayConnected
          ? "connected -> preview"
          : "disconnected -> open picker",
    });
    mintConnectedWallet();
  });
});

elements.mintRouteLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const destination = new URL(link.href, window.location.href);
    if (!isMintRoute() || !isMintRoute(destination.pathname)) return;

    event.preventDefault();
    focusMintSection({ updateHash: true });
  });
});

elements.walletPickerModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-wallet-picker-close]")) {
    closeWalletPicker();
    return;
  }

  const walletButton = event.target.closest(".wallet-modal-option");
  if (walletButton?.dataset.wallet) {
    connectWallet(walletButton.dataset.wallet);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.walletPickerModal.hidden) {
    closeWalletPicker();
  }
});

elements.walletConnectButton.addEventListener("click", () => {
  openWalletPicker();
});

elements.walletDisconnectButton.addEventListener("click", disconnectWallet);

refreshWallets();
window.NFTreeWalletMint?.onWalletsChanged?.(setWallets);
renderWalletState();
updateMintButtons();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", focusMintRouteIfNeeded, { once: true });
} else {
  focusMintRouteIfNeeded();
}

loadSalePools();
loadListings();
