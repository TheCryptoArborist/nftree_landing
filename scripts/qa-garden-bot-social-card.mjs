// Exercise the actual shipped React result dialog with synthetic result data.
// Only this local QA server substitutes the app mount; no wallet is connected.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = path.resolve("public");
const bundle = fs.readFileSync("public/battle/assets/garden-bot-same-origin-preview.js", "utf8");
const mount = 'xj(document.getElementById("root")).render(a.jsx(QQ,{}));';
assert.equal(bundle.split(mount).length, 2, "QA must replace exactly one app mount");
const fixtureMount = `
const qaParams=new URLSearchParams(location.search);
const qaImage=qaParams.has("broken")?"/battle/assets/missing-art.png":qaParams.has("remote")?"https://example.invalid/nft.png":"/battle/assets/battle-trees/player-stage-4.png";
xj(document.getElementById("root")).render(a.jsx(TY,{
 open:true,title:"You Win!",score:"Final score: 57/50 vs 18/50",summary:"57 / 50 Growth reached.",
 imageUrl:qaImage,imageAlt:"Player growth stage 4",shareOptions:[{id:"victory",title:"Victory",message:"I won 57–18!"}],
 selectedShareOptionId:"victory",xShareUrl:"#",smsShareUrl:"#",facebookShareUrl:"#",leaderboardUrl:"#",
 canPlayAgain:true,onSelectShareOption:()=>{},onShare:()=>{},onCopy:()=>{},onClose:()=>{},onPlayAgain:()=>{}
}));`;
const html = fs.readFileSync("public/battle/garden-bot-preview/index.html", "utf8")
  .replace("garden-bot-same-origin-preview.js", "__qa-social-result.js");
const mime = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/__qa-result") { res.setHeader("Content-Type", "text/html"); res.end(html); return; }
    if (pathname === "/battle/assets/__qa-social-result.js") {
      res.setHeader("Content-Type", "text/javascript"); res.end(bundle.replace(mount, fixtureMount)); return;
    }
    const target = path.resolve(root, "." + pathname);
    assert.ok(target.startsWith(root + path.sep));
    res.setHeader("Content-Type", mime[path.extname(target)] || "application/octet-stream");
    res.end(fs.readFileSync(target));
  } catch { res.writeHead(404); res.end("Not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
fs.mkdirSync("qa-garden-bot-social", { recursive: true });
try {
  for (const [width, height] of [[320,568],[375,667],[390,844],[414,896]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.addInitScript(() => {
      window.qaShares = [];
      Object.defineProperty(navigator, "canShare", { configurable: true, value: data => data.files?.[0]?.type === "image/png" });
      Object.defineProperty(navigator, "share", { configurable: true, value: async data => {
        if (window.qaShareError) throw Object.assign(new Error("QA failure"), { name: window.qaShareError });
        window.qaShares.push({ text: data.text, name: data.files[0].name, size: data.files[0].size });
      } });
    });
    await page.goto(origin + "/__qa-result");
    const section = page.getByRole("region", { name: "Social result card" });
    await section.locator("img").waitFor();
    const image = await section.locator("img").evaluate(async img => {
      await img.decode(); return { w: img.naturalWidth, h: img.naturalHeight };
    });
    assert.deepEqual(image, { w: 1080, h: 1080 });
    const save = section.getByRole("link", { name: "Save Image" });
    assert.equal(await save.getAttribute("download"), "garden-bot-result.png");
    assert.match(await save.getAttribute("href"), /^blob:/);
    const share = section.getByRole("button", { name: "Share Card", exact: true });
    await share.click();
    const sent = await page.evaluate(() => window.qaShares);
    assert.equal(sent.length, 1); assert.match(sent[0].text, /www\.tree-token\.xyz/); assert.ok(sent[0].size > 1000);
    await page.evaluate(() => { window.qaShareError = "AbortError"; });
    await share.click();
    assert.equal(await section.getByRole("status").innerText(), "Save the image to attach it to X, Facebook, or a message.");
    await page.evaluate(() => { window.qaShareError = "NotAllowedError"; });
    await share.click();
    assert.match(await section.getByRole("status").innerText(), /Sharing failed/);
    await page.evaluate(() => { Object.defineProperty(navigator, "canShare", { value: () => false }); });
    await share.click();
    assert.match(await section.getByRole("status").innerText(), /unavailable here/);
    const box = await share.boundingBox();
    assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= height);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `qa-garden-bot-social/card-${width}.png` });
    // Ensure the new card doesn't make the existing bottom actions unreachable.
    await page.getByRole("button", { name: "Play Again", exact: true }).click();
    assert.deepEqual(errors, []);
    // Winning modal may reveal external NFT art; the card must still work.
    await page.route("https://example.invalid/**", route => route.abort());
    await page.goto(origin + "/__qa-result?remote=1");
    await page.getByRole("region", { name: "Social result card" }).locator("img").waitFor();
    await page.getByRole("button", { name: "Share Card", exact: true }).click();
    assert.equal(await page.evaluate(() => window.qaShares.length), 1);
    await page.goto(origin + "/__qa-result?broken=1");
    await page.getByRole("alert").filter({ hasText: "Battle artwork could not load" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Share Card", exact: true }).count(), 0);
    await page.close(); console.log(`PASS real result card: ${width}×${height}, PNG, file sharing, cancellation, fallback, image failure`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
