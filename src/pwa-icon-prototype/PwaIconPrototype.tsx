// PROTOTYPE (prototype/pwa-icon): throwaway. Rounds of crown icons for Crownkeep, now richer, more detailed coins and crowns, shown where
// an icon actually lives, plus what the status bar, title bar and splash do in
// each scheme. Switch with `?icon=H3|I1|I2|I3|I4|I5`, `?theme=page|fixed|graphite`,
// `?splash=dark|light`, `?scheme=dark|light`. The real tab's favicon and the
// real theme-color metas follow the choice; the home screens are mock-ups.
import { useEffect } from "react";
import "@fontsource-variable/geist";
import { useUrlParameter } from "../url-parameter";
import "./pwa-icon.css";

const iconKeys = ["H3", "I1", "I2", "I3", "I4", "I5"] as const;
type IconKey = (typeof iconKeys)[number];
type Form = "any" | "maskable" | "apple" | "favicon";

const light = "#f4f4f6";
const ink = "#18181d";
const crownPoints = "M136 330 112 176 188 236 256 136 324 236 400 176 376 330Z";

const fade = (id: string, stops: string[]) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join("")}</linearGradient>`;
const paints = `<defs>${fade("tile", ["#3d3d47", "#1c1c22"])}${fade("silver", ["#ffffff", "#b9b9c4"])}${fade("gold", ["#ffedb0", "#e8bb4e", "#a97b1f"])}${fade("deepgold", ["#a97b1f", "#6e4d10"])}${fade("enamel", ["#7fe8b4", "#22a067"])}${fade("steel", ["#4a4a55", "#18181d"])}<clipPath id="l"><rect width="256" height="512"/></clipPath><clipPath id="r"><rect x="256" width="256" height="512"/></clipPath></defs>`;

const around = (count: number, r: number, draw: (x: number, y: number) => string) =>
  Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count;
    return draw(256 + r * Math.cos(a), 256 + r * Math.sin(a));
  }).join("");
const beads = (colour: string, r: number, count = 48, size = 5) =>
  around(count, r, (x, y) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="${colour}"/>`);

const place = (inner: string, x: number, y: number, scale: number) =>
  `<g transform="translate(${x} ${y}) scale(${scale}) translate(-256 -258)">${inner}</g>`;

/** A full crown: body, jewelled tips, a stone at its centre and a set band. */
const fullCrown = (body: string, line: string, jewel: string) =>
  `<path d="${crownPoints}" fill="${body}" stroke="${body}" stroke-width="14" stroke-linejoin="round"/><path d="M256 232 280 272 256 312 232 272Z" fill="${jewel}" stroke="${line}" stroke-width="6" stroke-linejoin="round"/><circle cx="176" cy="290" r="13" fill="${jewel}" stroke="${line}" stroke-width="5"/><circle cx="336" cy="290" r="13" fill="${jewel}" stroke="${line}" stroke-width="5"/><circle cx="112" cy="166" r="20" fill="${jewel}" stroke="${line}" stroke-width="6"/><circle cx="256" cy="124" r="20" fill="${jewel}" stroke="${line}" stroke-width="6"/><circle cx="400" cy="166" r="20" fill="${jewel}" stroke="${line}" stroke-width="6"/><rect x="132" y="346" width="248" height="38" rx="10" fill="${body}" stroke="${line}" stroke-width="5"/>${[172, 214, 256, 298, 340].map((x) => `<circle cx="${x}" cy="365" r="8" fill="${line}"/>`).join("")}`;
const plainCrown = (colour: string) =>
  `<path d="${crownPoints}" fill="${colour}" stroke="${colour}" stroke-width="20" stroke-linejoin="round"/><rect x="132" y="346" width="248" height="36" rx="10" fill="${colour}"/>`;

const counterSmall = `<circle cx="256" cy="256" r="176" fill="${ink}"/><circle cx="256" cy="256" r="176" fill="${light}" clip-path="url(#l)"/><g clip-path="url(#l)">${place(plainCrown(ink), 256, 262, 0.72)}</g><g clip-path="url(#r)">${place(plainCrown(light), 256, 262, 0.72)}</g>`;

const icons: Record<
  IconKey,
  {
    name: string;
    idea: string;
    ground: string;
    round?: boolean;
    defs: string;
    mark: string;
    /** Redrawn for 16px, where the full mark would turn to mush. */
    small: string;
  }
> = {
  H3: {
    name: "Counterchange (last round)",
    idea: "The split coin from last round, kept here to compare against.",
    ground: "#34343d",
    defs: paints,
    mark: counterSmall,
    small: counterSmall,
  },
  I1: {
    name: "Silver crown coin",
    idea: "A struck silver coin: a raised rim, a ring of beads and a jewelled crown on a dark field, with green stones as the app's one colour.",
    ground: "url(#tile)",
    defs: paints,
    mark: `<circle cx="256" cy="256" r="190" fill="url(#silver)"/><circle cx="256" cy="256" r="166" fill="url(#steel)"/>${beads(light, 150)}${place(fullCrown("url(#silver)", ink, "#5fdc9a"), 256, 262, 0.62)}`,
    small: `<circle cx="256" cy="256" r="180" fill="url(#silver)"/><circle cx="256" cy="256" r="146" fill="${ink}"/>${place(plainCrown(light), 256, 262, 0.66)}`,
  },
  I2: {
    name: "Gold sovereign",
    idea: "A real gold coin with a ridged edge and a crown struck into it. Warm and instantly money, and it brings in a colour the app doesn't otherwise use.",
    ground: "url(#tile)",
    defs: paints,
    mark: `<circle cx="256" cy="256" r="190" fill="url(#gold)"/>${around(72, 178, (x, y) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#8a6214"/>`)}<circle cx="256" cy="256" r="160" fill="none" stroke="#8a6214" stroke-width="5"/>${place(fullCrown("url(#deepgold)", "#3f2c08", "#ffedb0"), 256, 262, 0.62)}`,
    small: `<circle cx="256" cy="256" r="180" fill="url(#gold)"/>${place(plainCrown("#5c4009"), 256, 262, 0.72)}`,
  },
  I3: {
    name: "Rich counterchange",
    idea: "The split coin with everything added back: beads round the rim and a jewelled crown, each swapping colour across the line. Keeps last round's idea and gives it the look of a real seal.",
    ground: "#34343d",
    defs: paints,
    mark: `<circle cx="256" cy="256" r="190" fill="${ink}"/><g clip-path="url(#l)"><circle cx="256" cy="256" r="190" fill="${light}"/>${beads(ink, 170)}${place(fullCrown(ink, light, light), 256, 262, 0.6)}</g><g clip-path="url(#r)">${beads(light, 170)}${place(fullCrown(light, ink, ink), 256, 262, 0.6)}</g>`,
    small: counterSmall,
  },
  I4: {
    name: "Enamel badge",
    idea: "A green enamel pin with a dark metal rim, a white crown and a glossy highlight. Something you'd be pleased to own, and the friendliest of the set.",
    ground: "url(#tile)",
    defs: paints,
    mark: `<circle cx="256" cy="256" r="190" fill="url(#steel)"/><circle cx="256" cy="256" r="164" fill="url(#enamel)"/><path d="M116 216A146 146 0 0 1 396 216C340 170 172 170 116 216Z" fill="#fff" opacity=".22"/>${place(fullCrown("#ffffff", ink, ink), 256, 262, 0.6)}`,
    small: `<circle cx="256" cy="256" r="180" fill="${ink}"/><circle cx="256" cy="256" r="146" fill="#35c583"/>${place(plainCrown("#ffffff"), 256, 262, 0.66)}`,
  },
  I5: {
    name: "Crown over a gold coin",
    idea: "A silver crown resting on a large gold coin, showing both objects in full rather than merging them. The most literal, and the most like an illustration.",
    ground: "url(#tile)",
    defs: paints,
    mark: `<circle cx="256" cy="312" r="130" fill="url(#gold)"/><circle cx="256" cy="312" r="102" fill="none" stroke="#8a6214" stroke-width="6"/>${place(fullCrown("url(#silver)", ink, "#5fdc9a"), 256, 180, 0.6)}`,
    small: `<circle cx="256" cy="316" r="126" fill="url(#gold)"/>${place(plainCrown(light), 256, 176, 0.62)}`,
  },
};

const forms: Record<Form, { rx: number; scale: number }> = {
  any: { rx: 112, scale: 1.15 },
  maskable: { rx: 0, scale: 1 },
  apple: { rx: 0, scale: 1.12 },
  favicon: { rx: 112, scale: 1.3 },
};

function iconSvg(key: IconKey, form: Form) {
  const icon = icons[key];
  const { rx: tile, scale: formScale } = forms[form];
  const rx = icon.round && tile > 0 ? 256 : tile;
  const scale = icon.round ? 1 : formScale;
  const mark = form === "favicon" ? icon.small : icon.mark;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${icon.defs}<rect width="512" height="512" rx="${rx}" fill="${icon.ground}"/><g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${mark}</g></svg>`;
}

const iconUrl = (key: IconKey, form: Form) =>
  `data:image/svg+xml,${encodeURIComponent(iconSvg(key, form))}`;

const themes = {
  page: {
    name: "Page colour, follows the system",
    dark: "#18181d",
    light: "#f2f2f5",
    media: true,
  },
  fixed: {
    name: "Dark page colour, always",
    dark: "#18181d",
    light: "#18181d",
    media: false,
  },
  graphite: {
    name: "Graphite, always",
    dark: "#2e2e36",
    light: "#2e2e36",
    media: false,
  },
} as const;
type ThemeKey = keyof typeof themes;

const splashes = { dark: "#18181d", light: "#f2f2f5" } as const;

/** Dark text on a pale bar, light text on a dark one, as a phone would. */
const onColour = (hex: string) =>
  Number.parseInt(hex.slice(1, 3), 16) > 128 ? "#18181d" : "#f4f4f6";

const neighbours = [
  ["#e8503a", "M"],
  ["#2f7bf6", "C"],
  ["#f6c343", "N"],
  ["#1fa97a", "P"],
  ["#8a5cf6", "S"],
  ["#f4f4f6", "G"],
  ["#111114", "T"],
] as const;

function Img({ k, form, size }: { k: IconKey; form: Form; size: number }) {
  return (
    <img
      src={iconUrl(k, form)}
      width={size}
      height={size}
      alt=""
      style={{ display: "block" }}
    />
  );
}

function HomeScreen({
  k,
  platform,
  dark,
}: {
  k: IconKey;
  platform: "android" | "ios";
  dark: boolean;
}) {
  const radius = platform === "android" ? "50%" : "22.5%";
  const form: Form = platform === "android" ? "maskable" : "apple";
  return (
    <figure className="pi-fig">
      <div
        className="pi-home"
        data-dark={dark}
        style={{ "--radius": radius } as React.CSSProperties}
      >
        {neighbours.slice(0, 3).map(([colour, letter]) => (
          <Neighbour key={letter} colour={colour} letter={letter} />
        ))}
        <div className="pi-app">
          <div className="pi-mask">
            <Img k={k} form={form} size={56} />
          </div>
          <span>Crownkeep</span>
        </div>
        {neighbours.slice(3).map(([colour, letter]) => (
          <Neighbour key={letter} colour={colour} letter={letter} />
        ))}
      </div>
      <figcaption>
        {platform === "android" ? "Android, circle mask" : "iOS, squircle"},{" "}
        {dark ? "dark" : "light"} wallpaper
      </figcaption>
    </figure>
  );
}

function Neighbour({ colour, letter }: { colour: string; letter: string }) {
  return (
    <div className="pi-app">
      <div
        className="pi-mask pi-neighbour"
        style={{ background: colour, color: onColour(colour) }}
      >
        {letter}
      </div>
      <span>App</span>
    </div>
  );
}

function Tabs({ k, dark }: { k: IconKey; dark: boolean }) {
  return (
    <figure className="pi-fig">
      <div className="pi-tabs" data-dark={dark}>
        <div className="pi-tab pi-tab-on">
          <Img k={k} form="favicon" size={16} />
          Crownkeep
        </div>
        <div className="pi-tab">
          <span className="pi-otherfav" />
          Inbox
        </div>
        <div className="pi-tab pi-tab-pinned">
          <Img k={k} form="favicon" size={16} />
        </div>
      </div>
      <figcaption>Favicon at a true 16px, {dark ? "dark" : "light"} tabs</figcaption>
    </figure>
  );
}

/** A slice of the settled Budget screen, so the bar can be judged against it. */
function BudgetTop({ dark }: { dark: boolean }) {
  return (
    <div className="pi-budget" data-dark={dark}>
      <div className="pi-month">November 2026</div>
      <div className="pi-rta">
        <small>Ready to Assign</small>
        <b>$420.00</b>
      </div>
      {[
        ["Groceries", "$182.40", 62],
        ["Rent", "$0.00", 100],
      ].map(([name, left, used]) => (
        <div className="pi-row" key={name}>
          <span>{name}</span>
          <em>{left}</em>
          <i>
            <u style={{ width: `${used}%` }} />
          </i>
        </div>
      ))}
    </div>
  );
}

function StatusBar({ colour, dark }: { colour: string; dark: boolean }) {
  return (
    <figure className="pi-fig">
      <div className="pi-phone">
        <div
          className="pi-status"
          style={{ background: colour, color: onColour(colour) }}
        >
          <span>9:41</span>
          <span>5G 80%</span>
        </div>
        <BudgetTop dark={dark} />
      </div>
      <figcaption>
        Status bar on the Budget, {dark ? "dark" : "light"}: <code>{colour}</code>
      </figcaption>
    </figure>
  );
}

function Launch({
  k,
  splash,
  theme,
  dark,
}: {
  k: IconKey;
  splash: string;
  theme: string;
  dark: boolean;
}) {
  return (
    <figure className="pi-fig">
      <div className="pi-launch">
        <div className="pi-phone">
          <div
            className="pi-splash"
            style={{ background: splash, color: onColour(splash) }}
          >
            <Img k={k} form="any" size={72} />
            <span>Crownkeep</span>
          </div>
        </div>
        <span className="pi-arrow" aria-hidden>
          →
        </span>
        <div className="pi-phone">
          <div
            className="pi-status"
            style={{ background: theme, color: onColour(theme) }}
          >
            <span>9:41</span>
            <span>5G 80%</span>
          </div>
          <BudgetTop dark={dark} />
        </div>
      </div>
      <figcaption>
        Launch on a {dark ? "dark" : "light"} system: <code>{splash}</code>{" "}
        splash, then the Budget
      </figcaption>
    </figure>
  );
}

function DesktopWindow({
  k,
  colour,
  dark,
}: {
  k: IconKey;
  colour: string;
  dark: boolean;
}) {
  return (
    <figure className="pi-fig">
      <div className="pi-window">
        <div
          className="pi-titlebar"
          style={{ background: colour, color: onColour(colour) }}
        >
          <Img k={k} form="favicon" size={16} />
          Crownkeep
          <span className="pi-winbuttons">— ▢ ✕</span>
        </div>
        <BudgetTop dark={dark} />
      </div>
      <figcaption>Installed on desktop, {dark ? "dark" : "light"}</figcaption>
    </figure>
  );
}

export function PwaIconPrototype() {
  const [iconParam, setIcon] = useUrlParameter("icon");
  const [themeParam, setTheme] = useUrlParameter("theme");
  const [splashParam, setSplash] = useUrlParameter("splash");
  const [schemeParam, setScheme] = useUrlParameter("scheme");
  const k: IconKey = iconKeys.find((i) => i === iconParam) ?? "I1";
  const themeKey: ThemeKey =
    themeParam === "fixed" || themeParam === "graphite" ? themeParam : "page";
  const splashKey = splashParam === "light" ? "light" : "dark";
  const theme = themes[themeKey];
  const splash = splashes[splashKey];
  const dark = schemeParam !== "light";
  const barColour = dark ? theme.dark : theme.light;

  const step = (by: number) => {
    const at = iconKeys.indexOf(k);
    setIcon(iconKeys[(at + by + iconKeys.length) % iconKeys.length], "replace");
  };

  // The real tab and the real browser UI follow the choice.
  useEffect(() => {
    document.title = "Crownkeep";
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) favicon.href = iconUrl(k, "favicon");
    for (const old of document.querySelectorAll('meta[name="theme-color"]')) {
      old.remove();
    }
    const add = (content: string, media?: string) => {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = content;
      if (media) meta.media = media;
      document.head.append(meta);
    };
    if (theme.media) {
      add(theme.dark, "(prefers-color-scheme: dark)");
      add(theme.light, "(prefers-color-scheme: light)");
    } else {
      add(theme.dark);
    }
  }, [k, theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("select")) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tags = [
    '<link rel="icon" href="/icon.svg" type="image/svg+xml" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" /> <!-- 180x180, opaque -->',
    ...(theme.media
      ? [
          `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${theme.dark}" />`,
          `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${theme.light}" />`,
        ]
      : [`<meta name="theme-color" content="${theme.dark}" />`]),
    "",
    "manifest:",
    `  theme_color: "${theme.dark}"`,
    `  background_color: "${splash}"`,
    '  icons: icon-192.png, icon-512.png (purpose "any")',
    '         icon-maskable-512.png (purpose "maskable")',
  ].join("\n");

  return (
    <div className="pi" data-dark={dark}>
      <header className="pi-head">
        <Img k={k} form="any" size={72} />
        <div>
          <h1>
            {k}. {icons[k].name}
          </h1>
          <p>{icons[k].idea}</p>
        </div>
      </header>

      <section>
        <h2>All of them</h2>
        <div className="pi-strip">
          {iconKeys.map((key) => (
            <button
              type="button"
              key={key}
              data-on={key === k}
              onClick={() => setIcon(key, "replace")}
            >
              <Img k={key} form="any" size={64} />
              <Img k={key} form="favicon" size={16} />
              <span>{key}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>On a home screen</h2>
        <div className="pi-grid">
          <HomeScreen k={k} platform="android" dark />
          <HomeScreen k={k} platform="android" dark={false} />
          <HomeScreen k={k} platform="ios" dark />
          <HomeScreen k={k} platform="ios" dark={false} />
        </div>
      </section>

      <section>
        <h2>Small, and in a browser</h2>
        <div className="pi-grid">
          <Tabs k={k} dark />
          <Tabs k={k} dark={false} />
          <figure className="pi-fig">
            <div className="pi-ladder">
              {[16, 24, 32, 48, 64].map((size) => (
                <Img key={size} k={k} form={size < 32 ? "favicon" : "any"} size={size} />
              ))}
            </div>
            <figcaption>16, 24 redrawn; 32, 48, 64 the full mark</figcaption>
          </figure>
        </div>
      </section>

      <section>
        <h2>The maskable icon</h2>
        <div className="pi-grid">
          <figure className="pi-fig">
            <div className="pi-safe">
              <Img k={k} form="maskable" size={192} />
              <span />
            </div>
            <figcaption>Full bleed; the mark stays inside the 80% safe circle</figcaption>
          </figure>
        </div>
      </section>

      <section>
        <h2>theme-color and the splash, against the Budget</h2>
        <div className="pi-grid">
          <StatusBar colour={barColour} dark={dark} />
          <Launch k={k} splash={splash} theme={barColour} dark={dark} />
          <DesktopWindow k={k} colour={barColour} dark={dark} />
        </div>
      </section>

      <section>
        <h2>What this choice ships</h2>
        <pre className="pi-state">{tags}</pre>
      </section>

      <div className="pi-switch">
        <button type="button" onClick={() => step(-1)} aria-label="Previous icon">
          ←
        </button>
        <strong>
          {k} ({icons[k].name})
        </strong>
        <button type="button" onClick={() => step(1)} aria-label="Next icon">
          →
        </button>
        <select
          aria-label="theme-color"
          value={themeKey}
          onChange={(e) => setTheme(e.target.value, "replace")}
        >
          {Object.entries(themes).map(([key, value]) => (
            <option key={key} value={key}>
              {value.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Splash"
          value={splashKey}
          onChange={(e) => setSplash(e.target.value, "replace")}
        >
          <option value="dark">Splash: dark</option>
          <option value="light">Splash: light</option>
        </select>
        <select
          aria-label="Scheme"
          value={dark ? "dark" : "light"}
          onChange={(e) => setScheme(e.target.value, "replace")}
        >
          <option value="dark">System: dark</option>
          <option value="light">System: light</option>
        </select>
      </div>
    </div>
  );
}
