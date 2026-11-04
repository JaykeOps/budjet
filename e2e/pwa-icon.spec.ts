import { expect, type Page, test } from "@playwright/test";

type Manifest = {
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
};

type Pixel = { r: number; g: number; b: number; a: number };

const manifestOf = async (page: Page): Promise<Manifest> => {
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const response = await page.request.get(`${href}`);
  return response.json();
};

/** Decodes the served image the way a browser would, so a bad export can't hide. */
const decode = (page: Page, src: string) =>
  page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no 2d canvas");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      data: Array.from(data),
    };
  }, src);

type Decoded = Awaited<ReturnType<typeof decode>>;

const pixelAt = ({ width, data }: Decoded, x: number, y: number): Pixel => {
  const i = (Math.round(y) * width + Math.round(x)) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
};

const everyPixel = (decoded: Decoded) =>
  Array.from({ length: decoded.width * decoded.height }, (_, i) => ({
    x: i % decoded.width,
    y: Math.floor(i / decoded.width),
    ...pixelAt(decoded, i % decoded.width, Math.floor(i / decoded.width)),
  }));

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the manifest offers K1 as any and maskable PNGs", async ({ page }) => {
  const { icons } = await manifestOf(page);

  expect(icons).toEqual([
    {
      src: "icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ]);

  for (const { src, sizes } of icons) {
    const { width, height } = await decode(page, `/${src}`);
    expect(`${width}x${height}`).toBe(sizes);
  }
});

test("the any icons sit on a rounded tile", async ({ page }) => {
  for (const [src, size] of [
    ["/icon-192.png", 192],
    ["/icon-512.png", 512],
  ] as const) {
    const icon = await decode(page, src);
    expect(pixelAt(icon, 0, 0).a).toBe(0);
    expect(pixelAt(icon, size / 2, 1).a).toBe(255);
  }
});

test("the maskable icon is full bleed with the coin inside the safe circle", async ({
  page,
}) => {
  const icon = await decode(page, "/icon-maskable-512.png");
  const pixels = everyPixel(icon);

  expect(pixels.every(({ a }) => a === 255)).toBe(true);

  // The tile's paler end is #3d3d47, so anything brighter is the coin or glass.
  const safeRadius = 512 * 0.4;
  const outside = pixels.filter(
    ({ x, y }) => Math.hypot(x + 0.5 - 256, y + 0.5 - 256) > safeRadius,
  );
  expect(outside.every(({ b }) => b <= 0x47)).toBe(true);
});

test("the Apple touch icon is an opaque 180 full bleed", async ({ page }) => {
  const href = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  const icon = await decode(page, `${href}`);

  expect([icon.width, icon.height]).toEqual([180, 180]);
  expect(everyPixel(icon).every(({ a }) => a === 255)).toBe(true);
});

test("the gradients and the glass survive the export", async ({ page }) => {
  const icon = await decode(page, "/icon-maskable-512.png");
  const near = (actual: number, expected: number) =>
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(3);

  // The tile runs #3d3d47 at the top to #1c1c22 at the bottom.
  near(pixelAt(icon, 256, 0).b, 0x47);
  near(pixelAt(icon, 256, 511).b, 0x22);

  // The sheen alone is about #d4d4dc here; the curved highlight brightens it.
  expect(pixelAt(icon, 356, 126).r).toBeGreaterThan(0xd4 + 10);

  // The sheen's dark band is about #9c9ca8 here; the glow below brightens it.
  expect(pixelAt(icon, 256, 414).r).toBeGreaterThan(0x9c + 10);

  // The crown's own gradient runs from #55555f down to #18181d.
  const crownTop = pixelAt(icon, 256, 200);
  const crownBand = pixelAt(icon, 256, 340);
  expect(crownBand.r).toBeLessThan(crownTop.r);
});

test("the favicon is the SVG", async ({ page }) => {
  const link = page.locator('link[rel="icon"]');
  await expect(link).toHaveAttribute("type", "image/svg+xml");

  const svg = await (
    await page.request.get(`${await link.getAttribute("href")}`)
  ).text();
  expect(svg).toContain("<title>Crownkeep</title>");
});

for (const [colorScheme, colour] of [
  ["dark", "#18181d"],
  ["light", "#f2f2f5"],
] as const) {
  test(`theme-color is ${colour} on a ${colorScheme} system`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });

    const active = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
      )
        .filter((meta) => matchMedia(meta.media).matches)
        .map((meta) => meta.content),
    );

    expect(active).toEqual([colour]);
  });
}

test("the manifest's colours are the dark page colour", async ({ page }) => {
  const manifest = await manifestOf(page);

  expect(manifest.theme_color).toBe("#18181d");
  expect(manifest.background_color).toBe("#18181d");
});
