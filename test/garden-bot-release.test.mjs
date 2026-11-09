import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = file => readFileSync(file, "utf8");
test("normal Garden Bot loads the accepted release and retains the preview", () => {
  const normal = read("public/battle/garden-bot/index.html"), preview = read("public/battle/garden-bot-preview/index.html");
  for (const html of [normal, preview]) {
    assert.match(html, /garden-bot-same-origin-preview.js/);
    assert.match(html, /garden-bot-social-card.css/);
    assert.match(html, /garden-bot-navigation.js/);
  }
  assert.match(normal, /<title>Garden Bot \| NFTree<\/title>/);
  assert.doesNotMatch(normal, /Startup Fix Test|noindex/);
  const config = read("netlify.toml");
  assert.ok(config.indexOf('from = "/battle/garden-bot"') < config.indexOf('from = "/battle/*"'));
});
test("other modes keep their original bundle and only gain boundary navigation", () => {
  for (const file of ["public/battle/index.html", "public/battle/trials/index.html", "public/battle/leaderboard/index.html"]) {
    const html = read(file);
    assert.match(html, /index-tree-lock-proof.js/);
    assert.match(html, /garden-bot-navigation.js/);
    assert.doesNotMatch(html, /garden-bot-same-origin-preview.js|garden-bot-social-card.css/);
  }
  assert.equal(createHash("sha256").update(readFileSync("public/battle/assets/index-BKkC2woN.js")).digest("hex"), "a4582d9b16074544b2315aac421871735cb5f86dc80cc28fd83f87342fcf4e35");
});
