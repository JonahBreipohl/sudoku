// App icon generator: draws the blossom (five ink-outlined petals around a tiny 3x3 grid) as SVG,
// then rasterizes the PNG sizes with Playwright. Run `node scripts/gen-app-icons.mjs`; it rewrites
// everything under public/icons/. No colors come from styles.css: icons live outside the page.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const OUT = fileURLToPath(new URL("../public/icons/", import.meta.url));
const INK = "#1f1a24";
const PAPER = "#fffafb";
const PINK = "#ffc1d3";
const PINK_SHADE = "#f58fb0";
const SKY = "#7cc8f3";
const SKY_BAND = "#4fb3f0";

// A petal pointing up from the origin, with the notch sakura petals have at the tip.
const PETAL = "M0 0C-46 -34 -66 -92 -34 -148C-24 -158 -12 -148 0 -128C12 -148 24 -158 34 -148C66 -92 46 -34 0 0Z";
// Its right half, drawn darker: the two-tone cel shade.
const SHADE = "M0 0C46 -34 66 -92 34 -148C24 -158 12 -148 0 -128Z";

const petals = (draw) => [0, 1, 2, 3, 4].map((k) => `<g transform="rotate(${k * 72})">${draw()}</g>`).join("");

function blossom(scale) {
  return `<g transform="translate(256 262) scale(${scale})">
    <g transform="translate(9 11)" fill="${INK}" stroke="${INK}" stroke-width="12" stroke-linejoin="round">${petals(() => `<path d="${PETAL}"/>`)}<circle r="64" stroke="none"/></g>
    <g stroke="${INK}" stroke-width="9" stroke-linejoin="round">${petals(() => `<path d="${PETAL}" fill="${PINK}"/><path d="${SHADE}" fill="${PINK_SHADE}" stroke="none"/><path d="${PETAL}" fill="none"/>`)}</g>
    <circle r="60" fill="${PAPER}" stroke="${INK}" stroke-width="9"/>
    <g fill="none" stroke="${INK}" stroke-linecap="round">
      <rect x="-36" y="-36" width="72" height="72" rx="6" stroke-width="7"/>
      <path d="M-12 -36V36M12 -36V36M-36 -12H36M-36 12H36" stroke-width="5"/>
    </g>
    <g fill="${INK}"><circle cx="-24" cy="-24" r="5.5"/><circle cx="0" cy="24" r="5.5"/><circle cx="24" cy="0" r="5.5"/></g>
  </g>`;
}

/** rx 0 is full bleed (maskable and Apple icons, which the OS crops itself). */
function svg(rx, scale) {
  const clip = rx ? `<defs><clipPath id="r"><rect width="512" height="512" rx="${rx}"/></clipPath></defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${clip}<rect width="512" height="512" rx="${rx}" fill="${SKY}"/><path d="M0 372H512V512H0Z" fill="${SKY_BAND}"${rx ? ' clip-path="url(#r)"' : ""}/>${blossom(scale)}</svg>\n`;
}

// The maskable art keeps the blossom and its shadow inside the 80% safe circle.
const ART = {
  any: svg(112, 1.3),
  maskable: svg(0, 1.12),
  apple: svg(0, 1.22),
};
writeFileSync(`${OUT}icon.svg`, ART.any);
writeFileSync(`${OUT}icon-maskable.svg`, ART.maskable);

const browser = await chromium.launch();
async function png(art, size, name, transparent) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${art}`);
  await page.screenshot({ path: `${OUT}${name}`, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await png(ART.any, 192, "icon-192.png", true);
await png(ART.any, 512, "icon-512.png", true);
await png(ART.maskable, 512, "icon-maskable-512.png", false);
await png(ART.apple, 180, "apple-touch-icon.png", false);
await png(ART.any, 32, "favicon-32.png", true);
await browser.close();
console.log("icons written to public/icons/");
