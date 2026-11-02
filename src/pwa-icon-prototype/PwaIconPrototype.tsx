// PROTOTYPE (prototype/pwa-icon): throwaway. Four icons for budjet, shown where
// an icon actually lives, plus what the status bar, title bar and splash do in
// each scheme. Switch with `?icon=A|B|C|D`, `?theme=page|fixed|graphite`,
// `?splash=dark|light`, `?scheme=dark|light`. The real tab's favicon and the
// real theme-color metas follow the choice; the home screens are mock-ups.
import { useEffect } from "react";
import "@fontsource-variable/geist";
import { useUrlParameter } from "../url-parameter";
import "./pwa-icon.css";

const iconKeys = ["A", "B", "C", "D"] as const;
type IconKey = (typeof iconKeys)[number];
type Form = "any" | "maskable" | "apple" | "favicon";

const light = "#f4f4f6";
const green = "#5fdc9a";
const graphite = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a5a66"/><stop offset=".55" stop-color="#2e2e36"/><stop offset="1" stop-color="#4a4a55"/></linearGradient></defs>`;

const stem = `<rect x="158" y="116" width="56" height="280" rx="28" fill="${light}"/>`;
const bowlCentre = `cx="256" cy="298" r="70"`;

const bar = (y: number, h: number, fill: number, colour: string) =>
  `<rect x="136" y="${y}" width="240" height="${h}" rx="${h / 2}" fill="${light}" opacity=".2"/><rect x="136" y="${y}" width="${fill}" height="${h}" rx="${h / 2}" fill="${colour}"/>`;

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
    name: "Monogram",
    idea: "A plain lowercase b on the Graphite card. The nearest thing to today's icon, and it says nothing about money.",
    ground: "url(#g)",
    defs: graphite,
    mark: `${stem}<circle ${bowlCentre} fill="none" stroke="${light}" stroke-width="56"/>`,
    small: `${stem}<circle ${bowlCentre} fill="none" stroke="${light}" stroke-width="56"/>`,
  },
  B: {
    name: "Meters",
    idea: "Three Category bars on the Card colour, the one green. It is the Budget screen, shrunk.",
    ground: "#222228",
    defs: "",
    mark: `${bar(150, 52, 172, green)}${bar(230, 52, 96, light)}${bar(310, 52, 208, light)}`,
    small: `${bar(146, 92, 160, green)}${bar(274, 92, 208, light)}`,
  },
  C: {
    name: "Envelope",
    idea: "The envelope in envelope budgeting, with a meter across it. Teaches the idea, but may read as a mail app.",
    ground: "url(#g)",
    defs: graphite,
    mark: `<rect x="116" y="166" width="280" height="190" rx="32" fill="${light}"/><path d="M130 186 256 272 382 186" fill="none" stroke="#2e2e36" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><rect x="150" y="312" width="212" height="20" rx="10" fill="#2e2e36" opacity=".25"/><rect x="150" y="312" width="124" height="20" rx="10" fill="#0f7343"/>`,
    small: `<rect x="116" y="166" width="280" height="190" rx="32" fill="${light}"/><path d="M130 190 256 280 382 190" fill="none" stroke="#2e2e36" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  D: {
    name: "Gauge b",
    idea: "The b's bowl is a meter, three-quarters green. A letter you can name and the product's one signature shape.",
    ground: "url(#g)",
    defs: graphite,
    mark: `<circle ${bowlCentre} fill="none" stroke="${light}" stroke-opacity=".22" stroke-width="56"/><circle ${bowlCentre} fill="none" stroke="${green}" stroke-width="56" stroke-linecap="round" stroke-dasharray="290 440" transform="rotate(-90 256 298)"/>${stem}`,
    small: `<circle ${bowlCentre} fill="none" stroke="${green}" stroke-width="56"/>${stem}`,
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
          <span>budjet</span>
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
          budjet
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
            <span>budjet</span>
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
          budjet
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
  const k: IconKey = iconKeys.find((i) => i === iconParam) ?? "A";
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
