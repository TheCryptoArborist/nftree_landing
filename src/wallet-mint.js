import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import {
  StandardConnect,
  SuiSignAndExecuteTransaction,
  SuiSignAndExecuteTransactionBlock,
  getWallets,
} from "@mysten/wallet-standard";

const MAINNET_CHAIN = "sui:mainnet";
const SUI_COIN_TYPE = "0x2::sui::SUI";
const SUI_RPC_URL = "https://fullnode.mainnet.sui.io:443";
const FALLBACK_PRICE_MIST = "25000000000";
const FALLBACK_PACKAGE_ID = "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5";
const FALLBACK_MINT_CONFIG_ID = "0xe83616020f61f73b30c40fd3f888ed397626afd071bd4666374c306d8e98b06b";
const GAS_BUDGET_MIST = 120_000_000n;

const client = new SuiJsonRpcClient({ network: "mainnet", url: SUI_RPC_URL });
const walletsApi = getWallets();

function walletSupportsSui(wallet) {
  return (
    wallet?.chains?.includes(MAINNET_CHAIN) ||
    wallet?.accounts?.some((account) => account.chains?.includes(MAINNET_CHAIN))
  );
}

function hasSigningFeature(wallet) {
  return Boolean(wallet?.features?.[SuiSignAndExecuteTransaction] || wallet?.features?.[SuiSignAndExecuteTransactionBlock]);
}

function normalizedName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+wallet\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findWallet(walletName) {
  const target = normalizedName(walletName);
  const wallets = walletsApi.get().filter((wallet) => walletSupportsSui(wallet) && hasSigningFeature(wallet));
  return (
    wallets.find((wallet) => normalizedName(wallet.name) === target) ||
    wallets.find((wallet) => normalizedName(wallet.name).includes(target) || target.includes(normalizedName(wallet.name))) ||
    undefined
  );
}

function getMainnetAccount(accounts) {
  return accounts.find((account) => account.chains?.includes(MAINNET_CHAIN)) || accounts[0];
}

function firstAvailablePool(salePoolStatus) {
  const pools = Array.isArray(salePoolStatus?.pools) ? salePoolStatus.pools : [];
  return (
    pools.find((pool) => pool.poolId === salePoolStatus?.activePoolId && Number(pool.count || 0) > 0) ||
    pools.find((pool) => Number(pool.count || 0) > 0)
  );
}

function formatMistAsSui(value) {
  const mist = BigInt(value || 0);
  const whole = mist / 1_000_000_000n;
  const fraction = mist % 1_000_000_000n;
  if (fraction === 0n) return `${whole.toLocaleString("en-US")} SUI`;
  return `${whole.toLocaleString("en-US")}.${fraction.toString().padStart(9, "0").replace(/0+$/, "")} SUI`;
}

async function fetchSuiCoins(owner) {
  const coins = [];
  let cursor = null;

  do {
    const page = await client.getCoins({
      owner,
      coinType: SUI_COIN_TYPE,
      cursor,
      limit: 50,
    });
    coins.push(...(page?.data || []));
    cursor = page?.hasNextPage ? page.nextCursor : null;
  } while (cursor && coins.length < 200);

  return coins;
}

async function assertMintBalance(account, mintPriceMist) {
  try {
    const [balance, coins] = await Promise.all([
      client.getBalance({ owner: account.address, coinType: SUI_COIN_TYPE }),
      fetchSuiCoins(account.address),
    ]);
    const totalBalance = BigInt(balance?.totalBalance || 0);
    const requiredBalance = mintPriceMist + GAS_BUDGET_MIST;
    const largestCoinBalance = coins.reduce((largest, coin) => {
      const coinBalance = BigInt(coin?.balance || 0);
      return coinBalance > largest ? coinBalance : largest;
    }, 0n);

    if (totalBalance < requiredBalance) {
      throw Object.assign(
        new Error(
          `${account.address.slice(0, 6)}...${account.address.slice(-4)} has ${formatMistAsSui(totalBalance)} available. ` +
            `NFTree minting needs ${formatMistAsSui(mintPriceMist)} plus up to ${formatMistAsSui(GAS_BUDGET_MIST)} gas.`,
        ),
        { code: "NFTREE_INSUFFICIENT_SUI" },
      );
    }

    if (coins.length && largestCoinBalance < requiredBalance) {
      throw Object.assign(
        new Error(
          `${account.address.slice(0, 6)}...${account.address.slice(-4)} has enough total SUI, but it appears split across smaller SUI coins. ` +
            `Merge SUI coins in the wallet so one coin can cover ${formatMistAsSui(mintPriceMist)} plus up to ${formatMistAsSui(GAS_BUDGET_MIST)} gas.`,
        ),
        { code: "NFTREE_INSUFFICIENT_SUI" },
      );
    }
  } catch (error) {
    if (error?.code === "NFTREE_INSUFFICIENT_SUI") throw error;
    console.warn("NFTree balance precheck failed; continuing with wallet signing.", error);
  }
}

function humanizeTransactionError(message) {
  if (String(message || "").includes("InsufficientCoinBalance")) {
    return `The connected wallet does not have enough spendable SUI for the 25 SUI NFTree mint plus gas. Add SUI, merge SUI coins in the wallet, or switch wallets and try again.`;
  }
  return message || "The wallet submitted the transaction, but it did not complete.";
}

function buildPurchaseTransaction({ account, pool, salePoolStatus }) {
  if (!pool?.poolId) throw new Error("No NFTree sale pool is available for minting.");

  const tx = new Transaction();
  tx.setSender(account.address);
  tx.setGasBudget(Number(GAS_BUDGET_MIST));

  const mintPriceMist = BigInt(salePoolStatus?.mintPriceMist || FALLBACK_PRICE_MIST);
  const latestPackageId = salePoolStatus?.latestPackageId || FALLBACK_PACKAGE_ID;
  const mintConfigId = salePoolStatus?.mintConfigId || FALLBACK_MINT_CONFIG_ID;
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(mintPriceMist)]);

  tx.moveCall({
    target: `${latestPackageId}::collection::purchase`,
    arguments: [tx.object(pool.poolId), payment, tx.object(mintConfigId)],
  });

  return tx;
}

async function signAndExecute(wallet, account, transaction) {
  const transactionWrapper = {
    toJSON: async () => transaction.toJSON({ client }),
  };

  const modernFeature = wallet.features[SuiSignAndExecuteTransaction];
  if (modernFeature) {
    return modernFeature.signAndExecuteTransaction({
      account,
      chain: MAINNET_CHAIN,
      transaction: transactionWrapper,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
  }

  const legacyFeature = wallet.features[SuiSignAndExecuteTransactionBlock];
  if (legacyFeature) {
    return legacyFeature.signAndExecuteTransactionBlock({
      account,
      chain: MAINNET_CHAIN,
      transactionBlock: Transaction.from(await transactionWrapper.toJSON()),
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
  }

  throw new Error(`${wallet.name} does not support Sui transaction signing.`);
}

async function connectAndMint({ walletName, salePoolStatus }) {
  const wallet = findWallet(walletName);
  if (!wallet) {
    throw new Error(`${walletName} was not detected in this browser.`);
  }

  const connectFeature = wallet.features[StandardConnect];
  if (!connectFeature) {
    throw new Error(`${wallet.name} cannot connect through Wallet Standard.`);
  }

  const connection = await connectFeature.connect();
  const account = getMainnetAccount(Array.from(connection.accounts || wallet.accounts || []));
  if (!account?.address) {
    throw new Error(`${wallet.name} did not return a Sui mainnet account.`);
  }

  const pool = firstAvailablePool(salePoolStatus);
  const mintPriceMist = BigInt(salePoolStatus?.mintPriceMist || FALLBACK_PRICE_MIST);
  await assertMintBalance(account, mintPriceMist);

  const transaction = buildPurchaseTransaction({ account, pool, salePoolStatus });
  const result = await signAndExecute(wallet, account, transaction);
  const transactionStatus = result?.effects?.status;

  if (transactionStatus?.status === "failure") {
    throw Object.assign(new Error(humanizeTransactionError(transactionStatus.error)), {
      code: "NFTREE_TRANSACTION_FAILED",
      digest: result.digest,
    });
  }

  return {
    account: account.address,
    digest: result.digest,
    poolId: pool.poolId,
    poolLabel: pool.label || "Sale pool",
    walletName: wallet.name,
  };
}

function availableWalletNames() {
  return walletsApi
    .get()
    .filter((wallet) => walletSupportsSui(wallet) && hasSigningFeature(wallet))
    .map((wallet) => wallet.name);
}

window.NFTreeWalletMint = {
  availableWalletNames,
  connectAndMint,
};
