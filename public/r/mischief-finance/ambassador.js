const WALLET_STORAGE_KEY = "nftreeConnectedWallet";

const state = {
  connectedAddress: "",
  connectedWallet: "",
  isConnecting: false,
  isDisconnecting: false,
  wallets: [],
};

const elements = {
  connectButton: document.querySelector("#ambassadorWalletConnectButton"),
  disconnectButton: document.querySelector("#ambassadorWalletDisconnectButton"),
  modal: document.querySelector("#ambassadorWalletModal"),
  modalDialog: document.querySelector("#ambassadorWalletModal .wallet-dialog"),
  modalOptions: document.querySelector("#ambassadorWalletModalOptions"),
  modalStatus: document.querySelector("#ambassadorWalletModalStatus"),
  status: document.querySelector("#ambassadorWalletStatus"),
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortenAddress(address) {
  const value = String(address || "");
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizedWalletName(walletName) {
  return String(walletName || "")
    .toLowerCase()
    .replace(/\s+wallet\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function preferredWalletRank(walletName) {
  const normalized = normalizedWalletName(walletName);
  if (normalized.includes("slush")) return 0;
  if (normalized.includes("phantom")) return 1;
  if (normalized.includes("nightly")) return 2;
  return 10;
}

function orderedWallets(wallets) {
  return Array.from(wallets || []).sort((left, right) => {
    const leftName = String(left?.name || "");
    const rightName = String(right?.name || "");
    const rankDifference = preferredWalletRank(leftName) - preferredWalletRank(rightName);
    if (rankDifference) return rankDifference;
    return leftName.localeCompare(rightName);
  });
}

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

function walletModule() {
  return window.NFTreeWalletMint || null;
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

function setStatus(message, mode = "") {
  if (!elements.status) return;
  elements.status.textContent = message;
  elements.status.classList.toggle("is-ready", mode === "ready");
  elements.status.classList.toggle("is-error", mode === "error");
  elements.status.classList.toggle("is-connecting", mode === "connecting");
}

function setModalStatus(message, mode = "") {
  if (!elements.modalStatus) return;
  elements.modalStatus.textContent = message;
  elements.modalStatus.classList.toggle("is-ready", mode === "ready");
  elements.modalStatus.classList.toggle("is-error", mode === "error");
}

function saveWalletConnection(walletName, accountAddress) {
  if (!walletName || !accountAddress) return;
  try {
    window.localStorage.setItem(
      WALLET_STORAGE_KEY,
      JSON.stringify({
        accountAddress,
        connectedAt: new Date().toISOString(),
        sourcePath: window.location.pathname,
        walletName,
      }),
    );
  } catch {}
}

function clearWalletConnection() {
  try {
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
  } catch {}
}

function renderWalletState() {
  const isConnected = Boolean(state.connectedWallet && state.connectedAddress);

  if (elements.connectButton) {
    elements.connectButton.disabled = state.isConnecting || state.isDisconnecting;
    elements.connectButton.textContent = state.isConnecting
      ? "Connecting..."
      : isConnected
        ? `${state.connectedWallet}: ${shortenAddress(state.connectedAddress)}`
        : "Connect Wallet";
  }

  if (elements.disconnectButton) {
    elements.disconnectButton.hidden = !isConnected;
    elements.disconnectButton.disabled = state.isDisconnecting;
  }

  if (isConnected && !state.isConnecting && !state.isDisconnecting) {
    setStatus(`Connected: ${state.connectedWallet} ${shortenAddress(state.connectedAddress)}. Continue to mint when ready.`, "ready");
  }
}

function refreshWallets() {
  const module = walletModule();
  if (!module) {
    state.wallets = [];
    setStatus("Wallet picker is loading. Try again in a moment.", "connecting");
    return;
  }

  const wallets = typeof module.availableWallets === "function"
    ? module.availableWallets()
    : (module.availableWalletNames?.() || []).map((name) => ({ name }));
  state.wallets = orderedWallets(wallets);
}

function renderWalletOptions() {
  if (!elements.modalOptions) return;

  if (!state.wallets.length) {
    elements.modalOptions.innerHTML = `
      <div class="wallet-empty-state" role="status">
        <strong>No Sui wallet detected</strong>
        <p>Install or unlock Slush, Phantom, Nightly, or another Sui-compatible wallet, then reopen this picker.</p>
      </div>
    `;
    setModalStatus("No Sui wallet detected in this browser.", "error");
    return;
  }

  elements.modalOptions.innerHTML = state.wallets
    .map((wallet) => {
      const walletName = String(wallet.name || "Sui wallet");
      return `
        <button class="wallet-modal-option" type="button" data-wallet="${escapeHtml(walletName)}">
          ${walletIconMarkup(wallet)}
          <span>${escapeHtml(walletName)}</span>
        </button>
      `;
    })
    .join("");
  activateWalletIconFallbacks(elements.modalOptions);
  setModalStatus("Choose a Sui wallet to connect. Minting will only happen after you continue to the NFTree mint page.", "ready");
}

function openWalletModal() {
  refreshWallets();
  renderWalletOptions();

  if (!state.wallets.length) {
    setStatus("No Sui wallet detected. Install or unlock a Sui wallet, then try again.", "error");
  }

  elements.modal.hidden = false;
  elements.modalDialog?.focus();
}

function closeWalletModal() {
  elements.modal.hidden = true;
}

async function connectWallet(walletName) {
  const module = walletModule();
  if (!module?.connectWallet) {
    setStatus("Wallet picker is still loading. Refresh the page and try again.", "error");
    return;
  }

  state.isConnecting = true;
  renderWalletState();
  setStatus(`Opening ${walletName} to connect.`, "connecting");
  setModalStatus(`Opening ${walletName}.`, "ready");

  try {
    const result = await module.connectWallet({ walletName });
    state.connectedWallet = result.walletName;
    state.connectedAddress = result.account;
    saveWalletConnection(result.walletName, result.account);
    closeWalletModal();
    setStatus(`Connected: ${result.walletName} ${shortenAddress(result.account)}. Continue to mint when ready.`, "ready");
  } catch (error) {
    setStatus(walletErrorMessage(error, "Wallet connection was not completed."), "error");
    setModalStatus(walletErrorMessage(error, "Wallet connection was not completed."), "error");
  } finally {
    state.isConnecting = false;
    renderWalletState();
  }
}

async function disconnectWallet() {
  const module = walletModule();
  state.isDisconnecting = true;
  renderWalletState();

  try {
    await module?.disconnectWallet?.({
      accountAddress: state.connectedAddress,
      walletName: state.connectedWallet,
    });
  } catch (error) {
    console.warn("NFTree ambassador wallet disconnect failed; clearing local state.", error);
  } finally {
    state.connectedAddress = "";
    state.connectedWallet = "";
    state.isDisconnecting = false;
    clearWalletConnection();
    renderWalletState();
    setStatus("Wallet disconnected.", "ready");
  }
}

function bindEvents() {
  elements.connectButton?.addEventListener("click", openWalletModal);
  elements.disconnectButton?.addEventListener("click", disconnectWallet);

  elements.modal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-ambassador-wallet-close]")) {
      closeWalletModal();
      return;
    }

    const walletButton = event.target.closest(".wallet-modal-option");
    if (walletButton?.dataset.wallet) {
      connectWallet(walletButton.dataset.wallet);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal?.hidden) {
      closeWalletModal();
    }
  });
}

bindEvents();
refreshWallets();
renderWalletState();
window.NFTreeWalletMint?.onWalletsChanged?.((wallets) => {
  state.wallets = orderedWallets(wallets);
  renderWalletOptions();
});
