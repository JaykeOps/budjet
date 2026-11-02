// PROTOTYPE (prototype/pwa-icon): throwaway. Rounds of crown icons for Crownkeep, now iterating on the coin, shown where
// an icon actually lives, plus what the status bar, title bar and splash do in
// each scheme. Switch with `?icon=D1|D2|E1|E2|E3|E4|E5`, `?theme=page|fixed|graphite`,
// `?splash=dark|light`, `?scheme=dark|light`. The real tab's favicon and the
// real theme-color metas follow the choice; the home screens are mock-ups.
import { useEffect } from "react";
import "@fontsource-variable/geist";
import { useUrlParameter } from "../url-parameter";
import "./pwa-icon.css";

const iconKeys = ["D1", "D2", "E1", "E2", "E3", "E4", "E5"] as const;
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

const coin = (fill: string, inner: string, scale: number) =>
  `<circle cx="256" cy="256" r="180" fill="${fill}"/>${place(inner, 256, 262, scale)}`;

/** Sets a mark drawn around the crown's centre at a new centre and size. */
const place = (inner: string, x: number, y: number, scale: number) =>
  `<g transform="translate(${x} ${y}) scale(${scale}) translate(-256 -258)">${inner}</g>`;

const crownOnly = (colour: string) => `${crown(colour)}${band(colour)}`;

/** The ridges round the edge of a real coin. */
const milling = Array.from(
  { length: 40 },
  (_, i) =>
    `<rect x="252" y="84" width="8" height="20" rx="4" fill="${ink}" opacity=".45" transform="rotate(${i * 9} 256 256)"/>`,
).join("");

/** A coin seen from the side, as a pill. */
const edge = (y: number, shift: number, fill: string) =>
  `<rect x="${136 + shift}" y="${y}" width="240" height="56" rx="28" fill="${fill}"/>`;

const oneShape = (inner: string) =>
  `<path d="M96 276A160 160 0 0 0 416 276L404 136 334 196 256 96 178 196 108 136Z" fill="${green}" stroke="${green}" stroke-width="16" stroke-linejoin="round"/>${inner}`;

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
  D1: {
    name: "Big crown coin (last round)",
    idea: "White coin from last round, kept here to compare against.",
    ground: "url(#g)",
    defs: graphite,
    mark: coin(light, `${crown(ink)}${band("#0f7343")}`, 0.8),
    small: coin(light, crownOnly(ink), 0.86),
  },
  D2: {
    name: "Green coin (last round)",
    idea: "Green coin from last round, kept here to compare against.",
    ground: "url(#g)",
    defs: graphite,
    mark: coin(green, crownOnly(ink), 0.76),
    small: coin(green, crownOnly(ink), 0.86),
  },
  E1: {
    name: "Milled coin",
    idea: "The green coin with the ridged edge of a real coin, so it reads as money in your hand rather than a token. The ridges disappear at 16px.",
    ground: "url(#g)",
    defs: graphite,
    mark: coin(green, crownOnly(ink), 0.62) + milling,
    small: coin(green, crownOnly(ink), 0.86),
  },
  E2: {
    name: "Coin stack",
    idea: "A stack of coins seen from the side, drawn as the app's own pills, with a crown on top. Your money, kept in a pile. The only one that isn't a circle.",
    ground: "url(#g)",
    defs: graphite,
    mark: `${edge(342, 8, light)}${edge(278, -8, light)}${edge(214, 4, green)}${place(crownOnly(light), 256, 132, 0.5)}`,
    small: `${edge(324, 0, light)}${edge(236, 0, green)}${place(crownOnly(light), 256, 136, 0.56)}`,
  },
  E3: {
    name: "Crowned coin",
    idea: "A coin wearing a crown, so the crown sits on top rather than inside. Warmer and more of a character, closer to the feel of Piggy.",
    ground: "url(#g)",
    defs: graphite,
    mark: `<circle cx="256" cy="304" r="136" fill="${green}"/><circle cx="256" cy="304" r="98" fill="none" stroke="${ink}" stroke-opacity=".3" stroke-width="14"/>${place(crown(light), 256, 136, 0.62)}`,
    small: `<circle cx="256" cy="304" r="136" fill="${green}"/>${place(crown(light), 256, 136, 0.62)}`,
  },
  E4: {
    name: "Crown-edged coin",
    idea: "One shape: the coin's top edge rises into a crown's three points. The most ownable silhouette, though it takes a moment to read as a coin.",
    ground: "url(#g)",
    defs: graphite,
    mark: oneShape(`<circle cx="256" cy="288" r="76" fill="none" stroke="${ink}" stroke-width="28"/>`),
    small: oneShape(`<circle cx="256" cy="288" r="64" fill="${ink}"/>`),
  },
  E5: {
    name: "Thick coin",
    idea: "The green coin with a darker edge beneath it, so it has weight, like the app's soft depth. The simplest step from last round's green coin.",
    ground: "url(#g)",
    defs: graphite,
    mark: `<circle cx="256" cy="278" r="170" fill="#0f7343"/><circle cx="256" cy="246" r="170" fill="${green}"/>${place(crownOnly(ink), 256, 250, 0.72)}`,
    small: `<circle cx="256" cy="278" r="170" fill="#0f7343"/><circle cx="256" cy="246" r="170" fill="${green}"/>${place(crownOnly(ink), 256, 250, 0.8)}`,
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
  const k: IconKey = iconKeys.find((i) => i === iconParam) ?? "E1";
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
