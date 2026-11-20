import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const icons = path.join(root, "extension", "icons");

const sizes = [16, 32, 48, 96, 128];
const main = await readFile(path.join(icons, "icon.svg"));
const light = await readFile(path.join(icons, "icon-light.svg"));
const dark = await readFile(path.join(icons, "icon-dark.svg"));

for (const size of sizes) {
  await sharp(main).resize(size, size).png().toFile(path.join(icons, `icon-${size}.png`));
}

for (const size of [16, 32]) {
  await sharp(light)
    .resize(size, size)
    .png()
    .toFile(path.join(icons, `theme-light-${size}.png`));
  await sharp(dark)
    .resize(size, size)
    .png()
    .toFile(path.join(icons, `theme-dark-${size}.png`));
}

await writeFile(
  path.join(icons, "README.md"),
  [
    "# NullSec icons",
    "",
    "Generated from `icon.svg`, `icon-light.svg`, and `icon-dark.svg` by `npm run icons`.",
    "Do not edit the generated PNG files by hand.",
    "",
  ].join("\n"),
);

console.warn(`Generated NullSec icons at ${path.relative(root, icons)}`);