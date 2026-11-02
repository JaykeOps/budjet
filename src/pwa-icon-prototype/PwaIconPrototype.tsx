// PROTOTYPE (prototype/pwa-icon): throwaway. Rounds of crown icons for Crownkeep, iterating on A (Crown) and D (Crown coin), shown where
// an icon actually lives, plus what the status bar, title bar and splash do in
// each scheme. Switch with `?icon=A|A1|A2|D|D1|D2|D3`, `?theme=page|fixed|graphite`,
// `?splash=dark|light`, `?scheme=dark|light`. The real tab's favicon and the
// real theme-color metas follow the choice; the home screens are mock-ups.
import { useEffect } from "react";
import "@fontsource-variable/geist";
import { useUrlParameter } from "../url-parameter";
import "./pwa-icon.css";

const iconKeys = ["A", "A1", "A2", "D", "D1", "D2", "D3"] as const;
type IconKey = (typeof iconKeys)[number];
type Form = "any" | "maskable" | "apple" | "favicon";

const light = "#f4f4f6";
const green = "#5fdc9a";
const graphite = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a5a66"/><stop offset=".55" stop-color="#2e2e36"/><stop offset="1" stop-color="#4a4a55"/></linearGradient></defs>`;

const ink = "#2e2e36";

/** The classic silhouette, in any colour. */
const crown = (colour: string) =>
  `<path d="M136 330 112 176 188 236 256 136 324 236 400 176 376 330Z" fill="${colour}" stroke="${colour}" stroke-width="20" stroke-linejoin="round"/>`;
const band = (colour: string) =>
  `<rect x="140" y="346" width="232" height="34" rx="17" fill="${colour}"/>`;

/** Thick round strokes and ball tips, to match the pill controls. */
const softCrown = (colour: string) =>
  `<path d="M136 330 118 196 196 252 256 156 316 252 394 196 376 330Z" fill="${colour}" stroke="${colour}" stroke-width="36" stroke-linejoin="round"/><circle cx="116" cy="172" r="24" fill="${colour}"/><circle cx="256" cy="126" r="24" fill="${colour}"/><circle cx="396" cy="172" r="24" fill="${colour}"/>`;

const softBand = (colour: string) =>
  `<rect x="140" y="362" width="232" height="34" rx="17" fill="${colour}"/>`;

const keyhole = (colour: string, grow = 1) =>
  `<g transform="translate(256 280) scale(${grow}) translate(-256 -280)"><circle cx="256" cy="256" r="26" fill="${colour}"/><path d="M242 270 232 318H280L270 270Z" fill="${colour}" stroke="${colour}" stroke-width="6" stroke-linejoin="round"/></g>`;

const coin = (fill: string, inner: string, scale: number) =>
  `<circle cx="256" cy="256" r="180" fill="${fill}"/><g transform="translate(256 262) scale(${scale}) translate(-256 -258)">${inner}</g>`;

const meterRing = (arc: string, inner: string, scale: number) =>
  `<circle cx="256" cy="256" r="160" fill="none" stroke="${light}" stroke-opacity=".2" stroke-width="44"/><circle cx="256" cy="256" r="160" fill="none" stroke="${green}" stroke-width="44" stroke-linecap="round" stroke-dasharray="${arc}" transform="rotate(-90 256 256)"/><g transform="translate(256 262) scale(${scale}) translate(-256 -258)">${inner}</g>`;

const icons: Record<
  IconKey,
  {
    name: string;
    idea: string;
    ground: string;
    defs: string;
    mark: string;
    /** Redrawn for 16px, where the full mark would turn to mush. */
    small: string;
  }
> = {
  A: {
    name: "Crown (last round)",
    idea: "The plain crown from last round, kept here to compare against.",
    ground: "url(#g)",
    defs: graphite,
    mark: `${crown(light)}${band(green)}`,
    small: `${crown(light)}${band(light)}`,
  },
  A1: {
    name: "Soft crown",
    idea: "The same crown drawn in the app's own shapes: thick round strokes and ball tips, like the pills and bars. Friendlier and less like a stock crown.",
    ground: "url(#g)",
    defs: graphite,
    mark: `${softCrown(light)}${softBand(green)}`,
    small: `${softCrown(light)}${softBand(light)}`,
  },
  A2: {
    name: "Keyhole crown",
    idea: "A crown with a keyhole: this is yours, and it's kept. The only one that says the second half of the name, though the keyhole could suggest a password manager.",
    ground: "url(#g)",
    defs: graphite,
    mark: `${crown(light)}${keyhole(ink)}${band(green)}`,
    small: `${crown(light)}${keyhole(ink, 1.35)}`,
  },
  D: {
    name: "Crown coin (last round)",
    idea: "The crown coin from last round, kept here to compare against.",
    ground: "url(#g)",
    defs: graphite,
    mark: coin(light, `${crown(ink)}${band("#0f7343")}`, 0.62),
    small: coin(light, `${crown(ink)}${band(ink)}`, 0.62),
  },
  D1: {
    name: "Big crown coin",
    idea: "The crown grows until it nearly fills the coin, so it survives at 16px. A heavy, simple stamp.",
    ground: "url(#g)",
    defs: graphite,
    mark: coin(light, `${crown(ink)}${band("#0f7343")}`, 0.8),
    small: coin(light, `${crown(ink)}${band(ink)}`, 0.86),
  },
  D2: {
    name: "Green coin",
    idea: "The coin takes the Available green, so the icon is the app's one colour. The loudest on a home screen, and less crypto, more money you have.",
    ground: "url(#g)",
    defs: graphite,
    mark: coin(green, `${crown(ink)}${band(ink)}`, 0.76),
    small: coin(green, `${crown(ink)}${band(ink)}`, 0.86),
  },
  D3: {
    name: "Meter coin",
    idea: "The coin's rim is a Category meter, three-quarters green, around a white crown. Takes the crown from A, the round shape from D and the product's own meter.",
    ground: "url(#g)",
    defs: graphite,
    mark: meterRing("754 1006", `${crown(light)}${band(light)}`, 0.52),
    small: meterRing("1006 1006", `${crown(light)}${band(light)}`, 0.6),
  },
};

const forms: Record<Form, { rx: number; scale: number }> = {
  any: { rx: 112, scale: 1.15 },
  maskable: { rx: 0, scale: 1 },
  apple: { rx: 0, scale: 1.12 },
  favicon: { rx: 112, scale: 1.4 },
};

function iconSvg(key: IconKey, form: Form) {
  const icon = icons[key];
  const { rx, scale } = forms[form];
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
  const k: IconKey = iconKeys.find((i) => i === iconParam) ?? "A1";
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
