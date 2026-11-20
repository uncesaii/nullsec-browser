import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");
const minify = process.argv.includes("--minify");

const entryPoints = {
  background: "extension/src/background/index.ts",
  content: "extension/src/content/index.ts",
  sidebar: "extension/src/sidebar/index.tsx",
  dock: "extension/src/dock/index.tsx",
  options: "extension/src/options/index.tsx",
  privacy: "extension/src/privacy/index.tsx",
  devtools: "extension/src/devtools/index.ts",
  "devtools-panel": "extension/src/devtools/panel.tsx",
  styles: "extension/src/ui/styles.css",
};

async function copyStatic() {
  await mkdir(dist, { recursive: true });
  await cp(path.join(root, "extension", "static"), dist, { recursive: true });
  await cp(path.join(root, "extension", "icons"), path.join(dist, "icons"), {
    recursive: true,
  });
  await cp(path.join(root, "extension", "manifest.json"), path.join(dist, "manifest.json"));
  await cp(path.join(root, "prompts"), path.join(dist, "prompts"), { recursive: true });
  await cp(path.join(root, "report-templates"), path.join(dist, "report-templates"), {
    recursive: true,
  });
  await cp(path.join(root, "providers.json"), path.join(dist, "providers.json"));
  const manifest = JSON.parse(
    await readFile(path.join(dist, "manifest.json"), "utf8"),
  );
  await writeFile(path.join(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

const common = {
  bundle: true,
  entryPoints,
  outdir: dist,
  entryNames: "[name]",
  assetNames: "assets/[name]-[hash]",
  format: "iife",
  platform: "browser",
  target: ["firefox140"],
  jsx: "automatic",
  jsxImportSource: "preact",
  loader: { ".md": "text" },
  sourcemap: watch ? "inline" : false,
  minify,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": JSON.stringify(minify ? "production" : "development"),
  },
};

await rm(dist, { recursive: true, force: true });
await copyStatic();

if (watch) {
  const ctx = await context(common);
  await ctx.watch();
  console.warn("NullSec extension build watching for changes…");
} else {
  await build(common);
  console.warn(`NullSec extension built in ${path.relative(root, dist)}`);
}