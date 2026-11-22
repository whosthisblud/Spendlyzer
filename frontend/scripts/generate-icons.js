// Renders scripts/icon.svg to the PNG sizes the PWA manifest and iOS need.
// Usage: node scripts/generate-icons.js  (requires Playwright's Chromium)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const svg = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8");
const out = path.join(__dirname, "..", "public", "icons");
const sizes = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["maskable-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
  ["favicon-32.png", 32, 0],
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "icon.svg"), path.join(out, "icon.svg"));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size] of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.locator("svg").screenshot({ path: path.join(out, name), omitBackground: false });
  }
  await browser.close();
  console.log("Icons written to", out);
})();
