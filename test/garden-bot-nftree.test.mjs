import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { address, artworkUrl, queries, verifyBattleLink, recoverBattleNft, rememberBattleNft, rememberedBattle } from "../public/battle/assets/garden-bot-nftree.js";

const owner = address("0xa"), nftId = address("0xb"), battleId = address("0xc");
const config = { PACKAGE_ID: address("0xd"), CONFIG_ID: address("0xe"), PVP_EVENT_PACKAGE_ID: address("0xf") };
const nftType = "0x123::collection::NFT";
const record = { owner, nftId, battleId, digest: "start-digest" };
function transaction(kiosk = false) {
  return { digest: record.digest, transactionJson: { sender: owner, kind: { programmableTransaction: {
    inputs: [{ objectId: config.CONFIG_ID }, { objectId: "0x44" }, { objectId: nftId }, { objectId: "0x55" }, { kind: "PURE", pure: Buffer.from(nftId.slice(2), "hex").toString("base64") }],
    commands: [{ moveCall: { package: config.PACKAGE_ID, module: "battle", function: "create_ranked_bot_battle_v2_with_fifth_move" + (kiosk ? "_from_kiosk" : ""), typeArguments: [nftType], arguments: [0,1,2,3,4].map(input => ({ kind: "INPUT", input })) } }],
  } } }, effects: { status: "SUCCESS", objectChanges: { nodes: [{ address: battleId, idCreated: true, outputState: { asMoveObject: { contents: { type: { repr: config.PVP_EVENT_PACKAGE_ID + "::battle::RankedBotBattleV2" } } } } }] } } };
}
test("matches the exact automatically used NFT input and created battle for wallet and Kiosk starts", () => {
  assert.equal(verifyBattleLink(transaction(), record, config), nftType);
  assert.equal(verifyBattleLink(transaction(true), record, config), nftType);
});
test("rejects altered owner, NFT, digest, battle, config, command and failed transactions", () => {
  for (const changes of [{ owner: address("0x99") }, { nftId: address("0x99") }, { digest: "different" }, { battleId: address("0x99") }]) {
    assert.equal(verifyBattleLink(transaction(), { ...record, ...changes }, config), false);
  }
  for (const change of [
    tx => { tx.effects.status = "FAILURE"; },
    tx => { tx.effects.objectChanges.nodes[0].idCreated = false; },
    tx => { tx.transactionJson.kind.programmableTransaction.commands[0].moveCall.module = "other"; },
    tx => { tx.transactionJson.kind.programmableTransaction.commands[0].moveCall.arguments[2].input = 3; },
    tx => { tx.transactionJson.kind.programmableTransaction.inputs[0].objectId = "0x99"; },
  ]) { const tx = transaction(); change(tx); assert.equal(verifyBattleLink(tx, record, config), false); }
});
test("reload recovery reads metadata for the bound NFT ID, ignoring cached identity claims", async () => {
  const read = async (q, variables) => {
    if (q === queries.transaction) return { transaction: transaction() };
    assert.equal(variables.id, nftId);
    return { object: { address: nftId, asMoveObject: { contents: { type: { repr: nftType }, json: { name: "Tree NFT #300", image_url: "ipfs://cid/300.jpg" } } } } };
  };
  const nft = await recoverBattleNft({ ...record, name: "Fake", imageUrl: "https://wrong.invalid/art" }, config, read);
  assert.equal(nft.nftId, nftId); assert.equal(nft.name, "Tree NFT #300");
  assert.equal(nft.imageUrl, "https://ipfs.io/ipfs/cid/300.jpg");
  await assert.rejects(() => recoverBattleNft({ ...record, nftId: address("0x88") }, config, read), /could not be verified/);
});
test("selection remains automatic and battle hints are scoped to owner and battle", () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  rememberBattleNft(record, storage);
  assert.equal(rememberedBattle(owner, battleId, storage).nftId, nftId);
  assert.equal(rememberedBattle(address("0x99"), battleId, storage), null);
  assert.equal(rememberedBattle(owner, address("0x99"), storage), null);
  const bundle = readFileSync("public/battle/assets/garden-bot-same-origin-preview.js", "utf8");
  assert.match(bundle, /const I=await N\(n\)/);
  assert.match(bundle, /rememberBattleNft\(\{owner:U,battleId:Be.battleId,digest:Pe.digest,nftId:A.nftId\}\)/);
  assert.doesNotMatch(bundle, /chooseNftree|Change NFTree|Choose Your NFTree/);
});
test("NFT artwork accepts HTTPS and IPFS and rejects active or credentialed URLs", () => {
  for (const value of ["javascript:alert(1)", "data:image/svg+xml,anything", "http://insecure.invalid/a", "https://user:pass@example.com/a"]) assert.equal(artworkUrl(value), null);
  assert.equal(artworkUrl("https://example.com/nft.png"), "https://example.com/nft.png");
});
