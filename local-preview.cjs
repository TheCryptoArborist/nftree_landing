const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.PORT || 57053);
const host = "127.0.0.1";
const root = path.join(__dirname, "public");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendIndex(res) {
  fs.readFile(path.join(root, "index.html"), (error, data) => {
    if (error) {
      res.writeHead(500);
      res.end("Missing index.html");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
    res.end(data);
  });
}

function sendJson(res, body) {
  res.writeHead(200, { "Content-Type": mimeTypes[".json"] });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${host}:${port}`);

  if (requestUrl.pathname === "/api/nftree-sale-pools") {
    sendJson(res, {
      latestPackageId: "0xcfb2af9a22d5a468f15e673c3ec40c76be8da3ec69c66405d832bb4d6985cdf5",
      mintConfigId: "0xe83616020f61f73b30c40fd3f888ed397626afd071bd4666374c306d8e98b06b",
      totalAvailable: 1890,
      activePoolId: "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a",
      activePoolLabel: "Pool 1",
      pools: [
        {
          label: "Pool 1",
          description: "Original sale pool",
          poolId: "0x8cb91464eec7ada1af801a439207647d78de66bc0d4f124d6437091745a0163a",
          count: 1081,
          firstNumber: 8,
          lastNumber: 1219,
        },
        {
          label: "Pool 2",
          description: "Active expansion pool",
          poolId: "0xedd6b2d96968197bc121ad7bed064a43b5ad7d84cbb8b7c00d8fd78bea3e2e4d",
          count: 780,
          firstNumber: 1220,
          lastNumber: 1999,
        },
        {
          label: "Pool 3",
          description: "Overflow pool for Tree NFT #1268-#1298",
          poolId: "0xed43f2ffb52ef542ea2cfccd0358431923460fec8ef659febda111614e20457a",
          count: 29,
          firstNumber: 1268,
          lastNumber: 1298,
        },
      ],
      fetchedAt: new Date().toISOString(),
      source: "local-preview",
    });
    return;
  }

  if (requestUrl.pathname === "/api/nftree-listings") {
    sendJson(res, {
      collectionUrl:
        "https://www.tradeport.xyz/sui/collection/0xf6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT?tab=items",
      count: 3,
      floorPrice: "TradePort",
      listings: [
        {
          name: "Tree NFT #301",
          nftreeNumber: 301,
          rarity: "Rare",
          priceLabel: "TradePort",
          imageUrl:
            "https://black-persistent-capybara-279.mypinata.cloud/ipfs/bafybeibcs6wmqckyw2xmsl3u2m6si2uww5orz4l6ewbmio5scmllvux7le/301.jpg",
        },
        {
          name: "Tree NFT #333",
          nftreeNumber: 333,
          rarity: "Mythic",
          priceLabel: "TradePort",
          imageUrl:
            "https://black-persistent-capybara-279.mypinata.cloud/ipfs/bafybeibcs6wmqckyw2xmsl3u2m6si2uww5orz4l6ewbmio5scmllvux7le/333.jpg",
        },
        {
          name: "Tree NFT #377",
          nftreeNumber: 377,
          rarity: "Mythic",
          priceLabel: "TradePort",
          imageUrl:
            "https://black-persistent-capybara-279.mypinata.cloud/ipfs/bafybeibcs6wmqckyw2xmsl3u2m6si2uww5orz4l6ewbmio5scmllvux7le/377.jpg",
        },
      ],
      fetchedAt: new Date().toISOString(),
      source: "local-preview",
    });
    return;
  }

  if (requestUrl.pathname === "/mint" || requestUrl.pathname === "/mint/") {
    res.writeHead(302, { Location: "/#mint" });
    res.end();
    return;
  }

  const relativePath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
  const targetPath = path.normalize(path.join(root, relativePath));
  const relativeToRoot = path.relative(root, targetPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(targetPath, (error, data) => {
    if (error) {
      sendIndex(res);
      return;
    }

    const extension = path.extname(targetPath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[extension] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(port, host);
