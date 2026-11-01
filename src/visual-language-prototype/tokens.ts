// PROTOTYPE (prototype/visual-language): throwaway. Three candidate visual
// languages for budjet, each a dark scheme (first) and a light scheme. Every
// colour is opaque hex so contrast can be computed straight from these values.

export type Scheme = {
  bg: string;
  surface: string;
  raised: string;
  line: string;
  controlBorder: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  accentText: string;
  /** The block behind Ready to Assign, and the text on it. */
  hero: string;
  onHero: string;
  negative: string;
  negativeTint: string;
  onNegativeTint: string;
  positive: string;
  positiveTint: string;
  onPositiveTint: string;
  focus: string;
  meterTrack: string;
  meterFill: string;
  meterOver: string;
};

export type Shape = {
  font: string;
  /** Extra CSS for the money display face (width, optical size). */
  displayWidth: string;
  radiusControl: string;
  radiusCard: string;
  /** How a Category shows its Spending against what it was given. */
  meter: "envelope" | "segments" | "bar";
  tile: "monogram" | "none" | "disc";
};

export type Variant = {
  name: string;
  idea: string;
  shape: Shape;
  dark: Scheme;
  light: Scheme;
};

export const variants: Record<"A" | "B" | "C", Variant> = {
  A: {
    name: "Fig",
    idea: "Plum and saffron. Each Category row is an envelope: its background is the money still in it, and drains as you spend.",
    shape: {
      font: "'Bricolage Grotesque Variable', system-ui, sans-serif",
      displayWidth: "normal",
      radiusControl: "12px",
      radiusCard: "20px",
      meter: "envelope",
      tile: "monogram",
    },
    dark: {
      bg: "#1c1324",
      surface: "#271b31",
      raised: "#3a2a4a",
      line: "#3e3049",
      controlBorder: "#8c7a9c",
      text: "#f5eef8",
      muted: "#bfaecb",
      accent: "#ffc94d",
      onAccent: "#2a1530",
      accentText: "#ffd66e",
      hero: "#271b31",
      onHero: "#f5eef8",
      negative: "#ff8fa3",
      negativeTint: "#4a1f33",
      onNegativeTint: "#ffb0bf",
      positive: "#8fe3b0",
      positiveTint: "#213a33",
      onPositiveTint: "#9cefbd",
      focus: "#ffd66e",
      meterTrack: "#3e3049",
      meterFill: "#ffc94d",
      meterOver: "#ff8fa3",
    },
    light: {
      bg: "#f7f1f8",
      surface: "#ffffff",
      raised: "#f0e4f5",
      line: "#e8dcec",
      controlBorder: "#8a7898",
      text: "#22142b",
      muted: "#5e4c6b",
      accent: "#5a2d7a",
      onAccent: "#ffffff",
      accentText: "#5a2d7a",
      hero: "#ffffff",
      onHero: "#22142b",
      negative: "#b8234b",
      negativeTint: "#fce6ec",
      onNegativeTint: "#a51d42",
      positive: "#13734a",
      positiveTint: "#e2f4ea",
      onPositiveTint: "#0e6640",
      focus: "#5a2d7a",
      meterTrack: "#e8dcec",
      meterFill: "#5a2d7a",
      meterOver: "#c0264f",
    },
  },
  B: {
    name: "Petrol",
    idea: "Deep petrol and lilac, no Category tiles. The figures carry the screen: Ready to Assign in big numerals, meters as ten counter segments.",
    shape: {
      font: "'Schibsted Grotesk Variable', system-ui, sans-serif",
      displayWidth: "normal",
      radiusControl: "6px",
      radiusCard: "10px",
      meter: "segments",
      tile: "none",
    },
    dark: {
      bg: "#0d2629",
      surface: "#123236",
      raised: "#1a3f44",
      line: "#22494e",
      controlBorder: "#6e9599",
      text: "#e8f3f1",
      muted: "#a3c2c0",
      accent: "#c9b8ff",
      onAccent: "#1a1340",
      accentText: "#cdbdff",
      hero: "#0d2629",
      onHero: "#e8f3f1",
      negative: "#ff9a7a",
      negativeTint: "#46261f",
      onNegativeTint: "#ffae93",
      positive: "#6ee2b4",
      positiveTint: "#143f38",
      onPositiveTint: "#7debc0",
      focus: "#cdbdff",
      meterTrack: "#22494e",
      meterFill: "#a3c2c0",
      meterOver: "#ff9a7a",
    },
    light: {
      bg: "#edf3f2",
      surface: "#ffffff",
      raised: "#e2ecea",
      line: "#d2e0de",
      controlBorder: "#6f8a88",
      text: "#0d2629",
      muted: "#47615f",
      accent: "#4b33c4",
      onAccent: "#ffffff",
      accentText: "#4b33c4",
      hero: "#edf3f2",
      onHero: "#0d2629",
      negative: "#b83a1b",
      negativeTint: "#fbe6df",
      onNegativeTint: "#9e3014",
      positive: "#077250",
      positiveTint: "#ddf3ea",
      onPositiveTint: "#066b4a",
      focus: "#4b33c4",
      meterTrack: "#d2e0de",
      meterFill: "#2f6b66",
      meterOver: "#c9401f",
    },
  },
  C: {
    name: "Riso",
    idea: "Two-ink print: ultramarine and yellow. Ready to Assign is a solid block of ink, meters are thick and round, everything is soft.",
    shape: {
      font: "'Gabarito Variable', system-ui, sans-serif",
      displayWidth: "normal",
      radiusControl: "999px",
      radiusCard: "26px",
      meter: "bar",
      tile: "disc",
    },
    dark: {
      bg: "#1b2470",
      surface: "#24308a",
      raised: "#2e3c9c",
      line: "#3a48a8",
      controlBorder: "#8f9ae0",
      text: "#fff6fa",
      muted: "#c7ccf5",
      accent: "#ffe14d",
      onAccent: "#1b2470",
      accentText: "#ffe14d",
      hero: "#ffe14d",
      onHero: "#1b2470",
      negative: "#ff9ccb",
      negativeTint: "#5a2a7e",
      onNegativeTint: "#ffb3d7",
      positive: "#5fe8d2",
      positiveTint: "#195a7f",
      onPositiveTint: "#7ff2e0",
      focus: "#ffe14d",
      meterTrack: "#3a48a8",
      meterFill: "#fff6fa",
      meterOver: "#ff9ccb",
    },
    light: {
      bg: "#f5f3ff",
      surface: "#ffffff",
      raised: "#ece9fb",
      line: "#dcd8f3",
      controlBorder: "#7a7fb8",
      text: "#1b2470",
      muted: "#4c5394",
      accent: "#1b2470",
      onAccent: "#ffe14d",
      accentText: "#2f3fb0",
      hero: "#1b2470",
      onHero: "#ffe14d",
      negative: "#c2186b",
      negativeTint: "#fde3ef",
      onNegativeTint: "#a3155a",
      positive: "#00776a",
      positiveTint: "#d8f5ef",
      onPositiveTint: "#00695e",
      focus: "#c2186b",
      meterTrack: "#e4e1f7",
      meterFill: "#1b2470",
      meterOver: "#d61f78",
    },
  },
};

export type Pairing = {
  label: string;
  fg: keyof Scheme;
  bg: keyof Scheme;
  /** 4.5 for text, 3 for UI components and graphics (WCAG 2.2 1.4.3, 1.4.11). */
  min: 4.5 | 3;
};

export const pairings: Pairing[] = [
  { label: "Text on page", fg: "text", bg: "bg", min: 4.5 },
  { label: "Text on card", fg: "text", bg: "surface", min: 4.5 },
  { label: "Text on raised", fg: "text", bg: "raised", min: 4.5 },
  { label: "Muted on page", fg: "muted", bg: "bg", min: 4.5 },
  { label: "Muted on card", fg: "muted", bg: "surface", min: 4.5 },
  { label: "Muted on raised", fg: "muted", bg: "raised", min: 4.5 },
  { label: "Link on page", fg: "accentText", bg: "bg", min: 4.5 },
  { label: "Link on card", fg: "accentText", bg: "surface", min: 4.5 },
  { label: "Button label", fg: "onAccent", bg: "accent", min: 4.5 },
  { label: "Ready to Assign", fg: "onHero", bg: "hero", min: 4.5 },
  { label: "Negative on card", fg: "negative", bg: "surface", min: 4.5 },
  { label: "Negative on raised", fg: "negative", bg: "raised", min: 4.5 },
  {
    label: "Overspent pill",
    fg: "onNegativeTint",
    bg: "negativeTint",
    min: 4.5,
  },
  { label: "Positive on card", fg: "positive", bg: "surface", min: 4.5 },
  { label: "Positive on raised", fg: "positive", bg: "raised", min: 4.5 },
  {
    label: "Available pill",
    fg: "onPositiveTint",
    bg: "positiveTint",
    min: 4.5,
  },
  {
    label: "Control border on card",
    fg: "controlBorder",
    bg: "surface",
    min: 3,
  },
  { label: "Focus ring on page", fg: "focus", bg: "bg", min: 3 },
  { label: "Focus ring on card", fg: "focus", bg: "surface", min: 3 },
  { label: "Primary button on card", fg: "accent", bg: "surface", min: 3 },
  { label: "Meter fill on track", fg: "meterFill", bg: "meterTrack", min: 3 },
  { label: "Meter over on track", fg: "meterOver", bg: "meterTrack", min: 3 },
];

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
