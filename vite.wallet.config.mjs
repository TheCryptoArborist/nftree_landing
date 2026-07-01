import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default {
  root: rootDir,
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.resolve(rootDir, "src/wallet-mint.js"),
      formats: ["iife"],
      name: "NFTreeWalletMintBundle",
      fileName: () => "nftree-wallet-mint.js",
    },
    outDir: path.resolve(rootDir, "public/assets"),
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
};
