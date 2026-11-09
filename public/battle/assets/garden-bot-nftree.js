/** Preview-only battle NFT identity. Keeps existing automatic NFT selection. */
export const GRAPHQL = "https://graphql.mainnet.sui.io/graphql";
export const NFT_TYPE = "0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT";
export function address(value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{1,64}$/i.test(value)) return null;
  return "0x" + value.slice(2).toLowerCase().padStart(64, "0");
}
export function typeName(value) {
  return typeof value === "string" ? value.replace(/0x[0-9a-f]+/gi, s => address(s) || s) : "";
}
export function artworkUrl(value) {
  if (typeof value !== "string") return null;
  if (value.startsWith("ipfs://")) value = "https://ipfs.io/ipfs/" + value.slice(7).replace(/^ipfs\//, "");
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
const ownerFields = `owner { __typename ... on AddressOwner { address { address } } ... on ObjectOwner { address { address } } }`;
const contentFields = `contents { type { repr } json display { output errors } }`;
const objectFields = `address ${ownerFields} asMoveObject { ${contentFields} }`;
export const queries = {
  object: `query PickerObject($id:SuiAddress!){object(address:$id){${objectFields}}}`,
  transaction: `query PickerTransaction($digest:String!){transaction(digest:$digest){digest transactionJson effects{status objectChanges(first:50){nodes{address idCreated outputState{asMoveObject{contents{type{repr}}}}}}}}}`,
};
export async function request(query, variables, fetchFn = fetch) {
  const response = await fetchFn(GRAPHQL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("NFTree lookup is unavailable. Please retry.");
  const json = await response.json();
  if (json.errors?.length || !json.data) throw new Error("NFTree lookup could not be completed. Please retry.");
  return json.data;
}
function contents(node) { return node?.contents || node?.asMoveObject?.contents; }
function fields(node) { return contents(node)?.json || {}; }
export function nftMetadata(node, allowedTypes, location, kiosk = {}) {
  const content = contents(node), id = address(node?.address), type = content?.type?.repr;
  if (!id || !allowedTypes.some(t => typeName(t) === typeName(type))) return null;
  const json = fields(node), display = content?.display?.output || {};
  const rawImage = display.image_url || json.image_url?.url || json.image_url;
  return {
    nftId: id, nftType: type, location, ...kiosk,
    name: String(display.name || json.name || `NFTree ${id.slice(-8)}`).slice(0, 100),
    number: json.number == null ? null : String(json.number).slice(0, 30),
    rarity: typeof (display.rarity || json.rarity) === "string" ? (display.rarity || json.rarity).slice(0, 40) : null,
    imageUrl: artworkUrl(rawImage),
  };
}
function safeStorage() { try { return globalThis.localStorage; } catch { return null; } }
const STORAGE_KEY = "garden-bot-nftree-battles-v1";
const memory = new Map();
export function rememberBattleNft({ owner, battleId, digest, nftId }, storage = safeStorage()) {
  const entry = { owner: address(owner), battleId: address(battleId), digest, nftId: address(nftId) };
  if (!entry.owner || !entry.battleId || !entry.nftId || typeof digest !== "string") return;
  const key = `${entry.owner}:${entry.battleId}`; memory.set(key, entry);
  if (memory.size > 100) memory.delete(memory.keys().next().value);
  try {
    const old = JSON.parse(storage?.getItem(STORAGE_KEY) || "[]");
    const list = Array.isArray(old) ? old.filter(e => `${e.owner}:${e.battleId}` !== key) : [];
    storage?.setItem(STORAGE_KEY, JSON.stringify([...list, entry].slice(-100)));
  } catch { /* Battle start must remain usable when browser storage is blocked. */ }
}
export function rememberedBattle(owner, battleId, storage = safeStorage()) {
  const key = `${address(owner)}:${address(battleId)}`;
  try {
    const list = JSON.parse(storage?.getItem(STORAGE_KEY) || "[]");
    const entry = Array.isArray(list) && list.find(e => `${e.owner}:${e.battleId}` === key);
    if (entry) return entry;
  } catch { /* Use current-tab fallback. */ }
  return memory.get(key) || null;
}
function argumentObject(ptb, arg) {
  if (arg?.kind !== "INPUT") return null;
  const input = ptb.inputs?.[arg.input];
  if (input?.objectId) return address(input.objectId);
  if (input?.kind === "PURE") {
    try { const bytes = atob(input.pure); return bytes.length === 32 ? address("0x" + [...bytes].map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")) : null; } catch { return null; }
  }
  return null;
}
export function verifyBattleLink(tx, record, config) {
  if (tx?.digest !== record.digest || tx.effects?.status !== "SUCCESS" || address(tx.transactionJson?.sender) !== address(record.owner)) return false;
  const ptb = tx.transactionJson?.kind?.programmableTransaction;
  if (!ptb || !Array.isArray(ptb.commands)) return false;
  const calls = ptb.commands.map(c => c.moveCall).filter(c => c && address(c.package) === address(config.PACKAGE_ID) && c.module === "battle" && /^create_(ranked_bot_battle_v2_(standard|with_fifth_move)|bot_battle)(_from_kiosk)?$/.test(c.function));
  if (calls.length !== 1) return false;
  const call = calls[0], kiosk = call.function.endsWith("_from_kiosk"), fifth = call.function.includes("with_fifth_move");
  const nftIndex = kiosk ? (fifth ? 4 : 3) : (fifth ? 2 : 1);
  if (argumentObject(ptb, call.arguments?.[0]) !== address(config.CONFIG_ID) || argumentObject(ptb, call.arguments?.[nftIndex]) !== address(record.nftId)) return false;
  const created = tx.effects.objectChanges?.nodes?.find(o => o.idCreated && address(o.address) === address(record.battleId));
  const battleType = created?.outputState?.asMoveObject?.contents?.type?.repr;
  if (!battleType || !/::battle::(RankedBotBattleV2|Battle)$/.test(battleType)) return false;
  const packageId = battleType.split("::")[0];
  if (![config.PVP_EVENT_PACKAGE_ID, config.ORIGINAL_PACKAGE_ID, config.PACKAGE_ID].some(id => id && address(id) === address(packageId))) return false;
  return call.typeArguments?.[0] || false;
}
export async function recoverBattleNft(record, config, read = request) {
  const data = await read(queries.transaction, { digest: record.digest });
  const type = verifyBattleLink(data.transaction, record, config);
  if (!type) throw new Error("The NFTree identity could not be verified for this battle.");
  const object = (await read(queries.object, { id: record.nftId })).object;
  const nft = nftMetadata(object, [type], "historical");
  if (!nft || nft.nftId !== address(record.nftId)) throw new Error("This battle's NFTree metadata is unavailable.");
  return { ...nft, battleId: address(record.battleId) };
}
export function useBattleNft(React, { owner, battleId, config }) {
  const key = `${address(owner)}:${address(battleId)}`;
  const [state, setState] = React.useState({ key: null, status: "checking", nft: null });
  React.useEffect(() => {
    let active = true;
    const record = owner && battleId ? rememberedBattle(owner, battleId) : null;
    setState({ key, status: record ? "checking" : "unavailable", nft: null });
    if (record) recoverBattleNft(record, config).then(nft => {
      if (active) setState({ key, status: "ready", nft });
    }).catch(() => { if (active) setState({ key, status: "unavailable", nft: null }); });
    return () => { active = false; };
  }, [key]);
  return state.key === key ? state : { status: "checking", nft: null };
}
