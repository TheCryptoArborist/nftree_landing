import test from "node:test";
import assert from "node:assert/strict";
import { drawSocialCard, WEBSITE, resolveCardArtwork } from "../public/battle/assets/garden-bot-social-card.js";

test("winning remote NFT reveal uses shipped card art without fetching the NFT", () => {
  const base = "https://nftree.net/battle/garden-bot-preview/";
  const fallback = "https://nftree.net/battle/assets/battle-trees/player-stage-4.png";
  for (const url of ["https://nfts.example/tree.png", "ipfs://art/tree", "data:image/png;base64,AAAA", "https://nftree.net/api/anything"]) {
    assert.equal(resolveCardArtwork(url, base), fallback);
  }
  assert.equal(resolveCardArtwork("/battle/assets/battle-trees/player-stage-2.png", base), "https://nftree.net/battle/assets/battle-trees/player-stage-2.png");
  assert.equal(resolveCardArtwork(null, base), null);
});

function recordingCanvas() {
  const calls = [];
  const ctx = new Proxy({
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: text => ({ width: text.length * 20 }),
  }, { get(target, key) { return key in target ? target[key] : (...args) => calls.push([key, ...args]); } });
  return { canvas: { getContext: () => ctx }, calls };
}

test("card includes the real result and TREE website, with contained portrait art", () => {
  const { canvas, calls } = recordingCanvas();
  const image = { naturalWidth: 400, naturalHeight: 800 };
  drawSocialCard(canvas, { title: "You Win!", score: "57/50 vs 18/50", image });
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1080);
  assert.deepEqual(calls.find(c => c[0] === "drawImage"), ["drawImage", image, 400, 230, 280, 560]);
  const text = calls.filter(c => c[0] === "fillText").map(c => c[1]);
  assert.ok(text.includes("YOU WIN!"));
  assert.ok(text.includes("57/50 vs 18/50"));
  assert.ok(text.includes(WEBSITE));
  assert.ok(text.includes("BATTLE ARTWORK • GARDEN BOT"));
});

test("landscape art is contained without cropping or stretching", () => {
  const { canvas, calls } = recordingCanvas();
  const image = { naturalWidth: 800, naturalHeight: 400 };
  drawSocialCard(canvas, { title: "Battle Complete", score: "18 vs 57", image });
  assert.deepEqual(calls.find(c => c[0] === "drawImage"), ["drawImage", image, 260, 370, 560, 280]);
});

test("personalized card identifies the actual NFTree instead of labeling it generic artwork", () => {
  const { canvas, calls } = recordingCanvas();
  drawSocialCard(canvas, { title: "You Win!", score: "57 vs 18", image: { width: 400, height: 800 }, nftName: "Tree NFT #300" });
  assert.ok(calls.some(c => c[0] === "fillText" && c[1] === "YOUR NFTREE • Tree NFT #300"));
  assert.ok(calls.some(c => c[0] === "fillText" && c[1] === WEBSITE));
  assert.equal(calls.some(c => c[0] === "fillText" && c[1] === "BATTLE ARTWORK • GARDEN BOT"), false);
});

test("missing artwork uses an explicit battle illustration fallback; invalid dimensions fail", () => {
  const { canvas, calls } = recordingCanvas();
  drawSocialCard(canvas, { title: "Battle Complete", score: "18 vs 57" });
  assert.ok(calls.some(c => c[0] === "fillText" && c[1] === "GARDEN BOT"));
  assert.throws(() => drawSocialCard(canvas, { title: "Result", score: "1 vs 2", image: {} }), /dimensions/);
  assert.throws(() => drawSocialCard({ getContext: () => null }, {}), /unavailable/);
});
