import { readFileSync, writeFileSync } from "node:fs";
import { buildPvpPreview } from "./pvp-mobile-patches.mjs";
writeFileSync("public/battle/assets/pvp-mobile-preview.js", buildPvpPreview(
  readFileSync("public/battle/assets/index-tree-lock-proof.js", "utf8"),
  readFileSync("public/battle/assets/garden-bot-same-origin-preview.js", "utf8"),
));
console.log("PvP mobile preview generated from original game and approved UI components.");
