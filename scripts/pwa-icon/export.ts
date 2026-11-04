// Draws the K1 "Glass dome" icon and writes every file the app ships into
// public/. Rerun after changing a shape or colour, then commit the results:
//   nix develop -c node scripts/pwa-icon/export.ts
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

type Form = { rx: number; scale: number };

const ink = "#18181d";

const defs = `<defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d3d47"/><stop offset="1" stop-color="#1c1c22"/></linearGradient><linearGradient id="deepsilver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55555f"/><stop offset="1" stop-color="${ink}"/></linearGradient><linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#d4d4dc"/><stop offset=".72" stop-color="#9c9ca8"/><stop offset="1" stop-color="#e8e8ee"/></linearGradient><linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".7"/></linearGradient><filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter><clipPath id="face"><circle cx="256" cy="256" r="186"/></clipPath></defs>`;

const crown = (colour: string, scale: number) =>
  `<g transform="translate(256 262) scale(${scale}) translate(-256 -258)"><path d="M136 330 112 176 188 236 256 136 324 236 400 176 376 330Z" fill="${colour}" stroke="${colour}" stroke-width="20" stroke-linejoin="round"/><rect x="132" y="346" width="248" height="36" rx="10" fill="${colour}"/></g>`;

const glass = `<g clip-path="url(#face)"><ellipse cx="256" cy="150" rx="168" ry="104" fill="url(#gloss)"/><ellipse cx="256" cy="414" rx="112" ry="30" fill="#fff" opacity=".4" filter="url(#blur)"/></g><circle cx="256" cy="256" r="186" fill="none" stroke="url(#edge)" stroke-width="6"/>`;

const fullMark = `<circle cx="256" cy="256" r="186" fill="url(#sheen)"/><circle cx="256" cy="256" r="160" fill="none" stroke="#6a6a76" stroke-opacity=".6" stroke-width="4"/>${crown("url(#deepsilver)", 0.68)}${glass}`;

// Redrawn for 16px, where the ring and the glass would turn to mush.
const smallMark = `<circle cx="256" cy="256" r="180" fill="url(#sheen)"/>${crown(ink, 0.72)}`;

const svg = (mark: string, { rx, scale }: Form) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>Crownkeep</title>${defs}<rect width="512" height="512" rx="${rx}" fill="url(#tile)"/><g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${mark}</g></svg>`;

const any: Form = { rx: 112, scale: 1.15 };
// Full bleed, leaving the coin inside the maskable 80% safe circle.
const maskable: Form = { rx: 0, scale: 1 };
const apple: Form = { rx: 0, scale: 1.12 };
const favicon: Form = { rx: 112, scale: 1.3 };

const pngs = [
  { file: "icon-192.png", size: 192, form: any },
  { file: "icon-512.png", size: 512, form: any },
  { file: "icon-maskable-512.png", size: 512, form: maskable },
  { file: "apple-touch-icon.png", size: 180, form: apple },
];

const publicFile = (file: string) =>
  new URL(`../../public/${file}`, import.meta.url);

await writeFile(publicFile("icon.svg"), `${svg(smallMark, favicon)}\n`);

const browser = await chromium.launch();
for (const { file, size, form } of pngs) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(fullMark, form)}`,
  );
  await writeFile(
    publicFile(file),
    await page.screenshot({ omitBackground: form.rx > 0 }),
  );
  await page.close();
}
await browser.close();
