import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const functions = [
  {
    filename: "nftree-listings.mjs",
    methods: ["GET", "OPTIONS"],
    name: "nftree-listings",
    route: "/api/nftree-listings",
  },
  {
    filename: "nftree-sale-pools.mjs",
    methods: ["GET", "OPTIONS"],
    name: "nftree-sale-pools",
    route: "/api/nftree-sale-pools",
  },
];

function usage() {
  console.error("Usage: node scripts/build-netlify-function-cache.mjs <source-functions-dir> <cache-dir>");
  process.exit(1);
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function findCachedNetlifyModule(root, relativeFile) {
  const npxRoot = path.join(root, ".deploy-cache", "npm", "_npx");
  const candidates = [];

  for (const entry of await fs.readdir(npxRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(npxRoot, entry.name, "node_modules", relativeFile);
    if (await fileExists(candidate)) {
      const stats = await fs.stat(candidate);
      candidates.push({ candidate, mtimeMs: stats.mtimeMs });
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (candidates[0]) return candidates[0].candidate;

  throw new Error(`Could not find cached Netlify module file: ${relativeFile}`);
}

async function importCached(root, relativeFile) {
  const modulePath = await findCachedNetlifyModule(root, relativeFile);
  return import(pathToFileURL(modulePath).href);
}

function manifestRoute(route, methods) {
  return {
    literal: route,
    methods,
    pattern: route,
  };
}

const [srcArg, dstArg] = process.argv.slice(2);
if (!srcArg || !dstArg) usage();

const thickquidityRoot = process.env.THICKQUIDITY_ROOT
  ? path.resolve(process.env.THICKQUIDITY_ROOT)
  : path.resolve(process.cwd(), "..");
const srcDir = path.resolve(srcArg);
const dstDir = path.resolve(dstArg);

const [{ zipNodeJs }, { RuntimeCache }, { MODULE_FORMAT }, { ARCHIVE_FORMAT }] = await Promise.all([
  importCached(thickquidityRoot, "@netlify/zip-it-and-ship-it/dist/runtimes/node/utils/zip.js"),
  importCached(thickquidityRoot, "@netlify/zip-it-and-ship-it/dist/utils/cache.js"),
  importCached(thickquidityRoot, "@netlify/zip-it-and-ship-it/dist/runtimes/node/utils/module_format.js"),
  importCached(thickquidityRoot, "@netlify/zip-it-and-ship-it/dist/archive.js"),
]);

await fs.mkdir(dstDir, { recursive: true });

const manifestFunctions = [];

for (const func of functions) {
  const mainFile = path.join(srcDir, func.filename);
  if (!(await fileExists(mainFile))) {
    throw new Error(`Missing Netlify function source: ${mainFile}`);
  }

  const zipResult = await zipNodeJs({
    aliases: new Map(),
    archiveFormat: ARCHIVE_FORMAT.ZIP,
    basePath: srcDir,
    cache: new RuntimeCache(),
    destFolder: dstDir,
    extension: ".mjs",
    featureFlags: {},
    filename: func.filename,
    mainFile,
    moduleFormat: MODULE_FORMAT.ESM,
    name: func.name,
    rewrites: new Map(),
    runtimeAPIVersion: 2,
    srcFiles: [mainFile],
  });

  manifestFunctions.push({
    bundler: "manual-netlify-bootstrap",
    buildData: {
      bootstrapVersion: zipResult.bootstrapVersion,
      runtimeAPIVersion: 2,
    },
    invocationMode: "stream",
    mainFile,
    name: func.name,
    path: path.resolve(zipResult.path),
    routes: [manifestRoute(func.route, func.methods)],
    runtime: "js",
    runtimeVersion: "nodejs18.x",
  });
}

await fs.writeFile(
  path.join(dstDir, "manifest.json"),
  JSON.stringify(
    {
      functions: manifestFunctions,
      system: {
        arch: process.arch,
        platform: process.platform,
      },
      timestamp: Date.now(),
      version: 1,
    },
    null,
    2,
  ),
);

console.log(`Prepared ${manifestFunctions.length} Netlify function archives in ${dstDir}`);
