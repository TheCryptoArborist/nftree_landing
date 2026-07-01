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
  wallets: [],
  selectedWallet: "",
  connectedWallet: "",
  connectedAddress: "",
  isConnecting: false,
  isMinting: false,
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
  walletOptions: document.querySelector("#walletOptions"),
  walletPickerStatus: document.querySelector("#walletPickerStatus"),
  walletPickerModal: document.querySelector("#walletPickerModal"),
  walletModalOptions: document.querySelector("#walletModalOptions"),
  walletModalStatus: document.querySelector("#walletModalStatus"),
  walletModalDialog: document.querySelector(".wallet-dialog"),
  walletOpenTriggers: document.querySelectorAll("[data-wallet-open]"),
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

function walletInitial(walletName) {
  const compact = String(walletName || "Wallet").replace(/\s+wallet\b/i, "").trim();
  if (/^sui$/i.test(compact)) return "SUI";
  return compact.slice(0, 2).toUpperCase() || "W";
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

function updateWalletButton() {
  if (state.isConnecting) {
    elements.walletConnectButton.textContent = "Connecting...";
    elements.walletConnectButton.disabled = true;
    return;
  }

  if (state.isMinting) {
    elements.walletConnectButton.textContent = "Minting...";
    elements.walletConnectButton.disabled = true;
    return;
  }

  elements.walletConnectButton.disabled = false;
  elements.walletConnectButton.textContent = state.connectedAddress ? `Mint ${shortId(state.connectedAddress)}` : "Connect";
}

function setWallets(wallets) {
  state.wallets = Array.isArray(wallets) ? wallets : [];
  renderCompactWalletOptions();
  renderWalletModalOptions();

  if (!state.connectedAddress && !state.wallets.length) {
    elements.selectedWalletLabel.textContent = "No wallet detected";
    setWalletStatus("No Sui wallet detected. Install or unlock a Sui wallet, then try again.", "error");
  } else if (!state.connectedAddress) {
    elements.selectedWalletLabel.textContent = "No wallet selected";
    setWalletStatus("Choose a Sui wallet before minting.");
  }

  updateWalletButton();
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
        <span class="wallet-icon" aria-hidden="true">?</span>
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
          <span class="wallet-icon" aria-hidden="true">${escapeHtml(walletInitial(walletName))}</span>
          <span>${escapeHtml(walletName.replace(/\s+wallet\b/i, ""))}</span>
        </button>
      `;
    })
    .join("");
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
        <span class="wallet-icon" aria-hidden="true">${escapeHtml(walletInitial(walletName))}</span>
        <span>${escapeHtml(walletName)}</span>
      </button>
    `;
    })
    .join("");
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

function closeWalletPicker() {
  elements.walletPickerModal.hidden = true;
}

async function connectWallet(walletName) {
  state.selectedWallet = walletName;
  state.isConnecting = true;
  updateWalletButton();
  renderCompactWalletOptions();
  renderWalletModalOptions();
  setWalletStatus(`Opening ${walletName} to connect.`, "connecting");
  setModalStatus(`Opening ${walletName}.`, "ready");

  try {
    const walletModule = getWalletModule();
    if (typeof walletModule.connectWallet !== "function") {
      throw new Error("The NFTree wallet module does not expose a connect function yet. Refresh the page and try again.");
    }

    const result = await walletModule.connectWallet({ walletName });
    state.connectedWallet = result.walletName;
    state.connectedAddress = result.account;
    elements.selectedWalletLabel.textContent = `${result.walletName} ${shortId(result.account)}`;
    setWalletStatus(`Connected to ${result.walletName}: ${shortId(result.account)}. Press Mint NFTree to submit a transaction.`, "ready");
    setModalStatus(`Connected to ${shortId(result.account)}. Close this picker and press Mint NFTree when ready.`, "ready");
    elements.mintContractStatus.textContent = `Connected: ${shortId(result.account)}. Minting is ready but no transaction has been submitted.`;
    closeWalletPicker();
  } catch (error) {
    const message = walletErrorMessage(error, "Wallet connection was not completed.");
    setWalletStatus(message, "error");
    setModalStatus(message, "error");
    elements.mintContractStatus.textContent = "No mint transaction was completed.";
  } finally {
    state.isConnecting = false;
    updateWalletButton();
    renderCompactWalletOptions();
    renderWalletModalOptions();
  }
}

async function mintConnectedWallet() {
  if (!state.connectedAddress || !state.connectedWallet) {
    openWalletPicker();
    return;
  }

  state.isMinting = true;
  updateWalletButton();
  setWalletStatus(`Opening ${state.connectedWallet} to approve a ${formatMistAsSui(state.salePoolStatus.mintPriceMist || MINT_PRICE_MIST)} NFTree mint.`, "connecting");
  elements.mintContractStatus.textContent = `Mint transaction target: ${shortId(state.salePoolStatus.latestPackageId || LATEST_PACKAGE_ID)}::collection::purchase using ${state.salePoolStatus.activePoolLabel || "an active pool"}.`;

  try {
    const walletModule = getWalletModule();
    if (typeof walletModule.mintWithConnectedWallet !== "function") {
      throw new Error("The NFTree wallet module cannot mint with the connected wallet yet. Refresh the page and try again.");
    }

    const result = await walletModule.mintWithConnectedWallet({
      walletName: state.connectedWallet,
      accountAddress: state.connectedAddress,
      salePoolStatus: state.salePoolStatus,
    });

    setWalletStatus(`Mint submitted through ${result.walletName}.`, "ready");
    elements.mintContractStatus.textContent = `Transaction ${shortId(result.digest)} used ${result.poolLabel}. Your NFTree should appear after the transaction confirms.`;
    await loadSalePools();
  } catch (error) {
    setWalletStatus(error instanceof Error ? error.message : "Wallet mint was not completed.", "error");
    elements.mintContractStatus.textContent = error?.digest
      ? `Transaction ${shortId(error.digest)} was submitted but did not mint an NFTree. No NFT was created.`
      : "No mint transaction was completed.";
  } finally {
    state.isMinting = false;
    updateWalletButton();
  }
}

elements.walletOptions.addEventListener("click", (event) => {
  const button = event.target.closest(".wallet-option");
  if (!button) return;
  openWalletPicker(button.dataset.wallet || "");
});

elements.walletOpenTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openWalletPicker();
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
  if (state.connectedAddress) {
    mintConnectedWallet();
    return;
  }

  openWalletPicker();
});

refreshWallets();
window.NFTreeWalletMint?.onWalletsChanged?.(setWallets);

loadSalePools();
loadListings();
