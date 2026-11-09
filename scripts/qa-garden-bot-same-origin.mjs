import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(process.cwd(), "public");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

function serve(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    if (pathname === "/battle/garden-bot-preview" || pathname === "/battle/garden-bot-preview/") {
      pathname = "/battle/garden-bot-preview/index.html";
    } else if (pathname === "/battle" || pathname === "/battle/") {
      pathname = "/battle/index.html";
    }
    const resolved = path.resolve(root, "." + pathname);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error("Unsafe path");
    const target = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? path.join(resolved, "index.html") : resolved;
    const data = fs.readFileSync(target);
    res.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(serve);
await new Promise(resolve => server.listen(4175, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const sizes = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
fs.mkdirSync("qa-garden-bot-preview", { recursive: true });
let failed = false;
try {
  for (const route of ["/battle/garden-bot-preview", "/battle/garden-bot"]) for (const { width, height } of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, route => route.abort());
    try {
      const response = await page.goto("http://127.0.0.1:4175" + route, { waitUntil: "domcontentloaded" });
      if (!response || response.status() !== 200) throw new Error("Preview page did not return 200");
      const start = page.locator('[data-testid="button-start-bot-battle"]');
      await start.waitFor({ state: "visible", timeout: 12000 });
      const label = (await start.innerText()).trim();
      if (!/play garden bot|starting/i.test(label)) throw new Error("Wrong game page: " + label);
      if (errors.length) throw new Error("Runtime error(s): " + errors.join(" | "));
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (horizontalOverflow) throw new Error("Horizontal overflow at " + width);
      await page.screenshot({ path: "qa-garden-bot-preview/preview-" + width + "x" + height + ".png", fullPage: false });
      console.log(JSON.stringify({ viewport: width + "x" + height, result: "PASS", button: label, origin: "same-site path" }));
    } catch (error) {
      failed = true;
      await page.screenshot({ path: "qa-garden-bot-preview/error-" + width + "x" + height + ".png", fullPage: false }).catch(() => {});
      console.error(JSON.stringify({ viewport: width + "x" + height, result: "FAIL", message: String(error), errors }));
    } finally {
      await page.close();
    }
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const documents = [];
    page.on("request", request => { if (request.resourceType() === "document") documents.push(new URL(request.url()).pathname); });
    await page.goto("http://127.0.0.1:4175/battle", { waitUntil: "domcontentloaded" });
    await page.locator('a[href="/battle/garden-bot"]').first().click();
    await page.locator('[data-testid="button-start-bot-battle"]').waitFor();
    if (!documents.includes("/battle/garden-bot")) throw new Error("Hub did not load the Garden Bot document");
    if (await page.locator('script[src="/battle/assets/garden-bot-same-origin-preview.js?v=tree-lock-v16"]').count() !== 1) throw new Error("Accepted Garden Bot bundle missing");
    await page.locator('a[href="/battle"]').filter({ visible: true }).first().click();
    await page.locator('a[href="/battle/garden-bot"]').first().waitFor();
    if (await page.locator('script[src="/battle/assets/index-tree-lock-v16.js"]').count() !== 1) throw new Error("Standard hub bundle not restored");
    await page.goBack();
    await page.locator('[data-testid="button-start-bot-battle"]').waitFor();
    if (await page.locator('script[src="/battle/assets/garden-bot-same-origin-preview.js?v=tree-lock-v16"]').count() !== 1) throw new Error("Back navigation lost Garden Bot release");
    console.log("PASS hub → Garden Bot → hub → browser back preserves bundle boundaries");
  } catch (error) { failed = true; console.error(String(error)); }
  finally { await page.close(); }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
if (failed) process.exitCode = 1;
