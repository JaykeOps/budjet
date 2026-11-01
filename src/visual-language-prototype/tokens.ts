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
  negative: string;
  negativeTint: string;
  onNegativeTint: string;
  positive: string;
  positiveTint: string;
  onPositiveTint: string;
  warning: string;
  focus: string;
  meterTrack: string;
  meterFill: string;
  meterNear: string;
  meterOver: string;
};

export type Shape = {
  radiusControl: string;
  radiusCard: string;
  radiusPill: string;
  cardBorder: "none" | "hairline";
  density: "comfortable" | "compact";
  meterHeight: string;
  tile: "tinted" | "outlined" | "filled";
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
    name: "Stepped navy",
    idea: "The reference design, flattened: navy, no shadows, surfaces lift by getting lighter, tinted Category tiles.",
    shape: {
      radiusControl: "10px",
      radiusCard: "14px",
      radiusPill: "8px",
      cardBorder: "none",
      density: "comfortable",
      meterHeight: "8px",
      tile: "tinted",
    },
    dark: {
      bg: "#0a1220",
      surface: "#121c2e",
      raised: "#1b2840",
      line: "#24344f",
      controlBorder: "#62769a",
      text: "#e9eef8",
      muted: "#9fb0ca",
      accent: "#2563eb",
      onAccent: "#ffffff",
      accentText: "#7aa8ff",
      negative: "#ff8f87",
      negativeTint: "#3a161c",
      onNegativeTint: "#ffa39c",
      positive: "#4fd68a",
      positiveTint: "#0e2e22",
      onPositiveTint: "#5ee39a",
      warning: "#f3b84f",
      focus: "#8fb6ff",
      meterTrack: "#26354f",
      meterFill: "#4f8cff",
      meterNear: "#e9a53a",
      meterOver: "#ff6b6b",
    },
    light: {
      bg: "#eef2f8",
      surface: "#ffffff",
      raised: "#e4eaf3",
      line: "#d6dde8",
      controlBorder: "#7a879c",
      text: "#0f1a2b",
      muted: "#4d5a6e",
      accent: "#1d5ae0",
      onAccent: "#ffffff",
      accentText: "#1a4fc7",
      negative: "#c0262d",
      negativeTint: "#fde7e7",
      onNegativeTint: "#a3141c",
      positive: "#14773a",
      positiveTint: "#e1f4e8",
      onPositiveTint: "#0f6330",
      warning: "#935400",
      focus: "#1a4fc7",
      meterTrack: "#dde3ec",
      meterFill: "#2563eb",
      meterNear: "#b86a00",
      meterOver: "#d32f2f",
    },
  },
  B: {
    name: "Hairline ink",
    idea: "Near-black, almost no colour but the accent. Cards sit flush on the page, separated by 1px lines. Denser, smaller radii, outlined tiles.",
    shape: {
      radiusControl: "6px",
      radiusCard: "8px",
      radiusPill: "4px",
      cardBorder: "hairline",
      density: "compact",
      meterHeight: "4px",
      tile: "outlined",
    },
    dark: {
      bg: "#0c0e13",
      surface: "#0c0e13",
      raised: "#171a22",
      line: "#272c38",
      controlBorder: "#5f6779",
      text: "#ececf1",
      muted: "#989fae",
      accent: "#2563eb",
      onAccent: "#ffffff",
      accentText: "#7fa9ff",
      negative: "#ff7b72",
      negativeTint: "#2c1416",
      onNegativeTint: "#ff8d85",
      positive: "#46c35a",
      positiveTint: "#11241a",
      onPositiveTint: "#56d06a",
      warning: "#e0a53a",
      focus: "#7fa9ff",
      meterTrack: "#272c38",
      meterFill: "#6b9bff",
      meterNear: "#e0a53a",
      meterOver: "#ff7b72",
    },
    light: {
      bg: "#ffffff",
      surface: "#ffffff",
      raised: "#f4f5f8",
      line: "#e2e5eb",
      controlBorder: "#7b8292",
      text: "#111318",
      muted: "#555c6b",
      accent: "#1f5ad6",
      onAccent: "#ffffff",
      accentText: "#1d4ed8",
      negative: "#c9252e",
      negativeTint: "#fdecec",
      onNegativeTint: "#a8161e",
      positive: "#17753a",
      positiveTint: "#e8f5ec",
      onPositiveTint: "#126430",
      warning: "#8f5200",
      focus: "#1d4ed8",
      meterTrack: "#e2e5eb",
      meterFill: "#1f5ad6",
      meterNear: "#b06600",
      meterOver: "#d3313a",
    },
  },
  C: {
    name: "Soft tonal",
    idea: "Surfaces tinted with the accent's blue, big rounded cards and pill buttons, thick meters, solid-colour Category tiles. Friendlier, louder.",
    shape: {
      radiusControl: "999px",
      radiusCard: "22px",
      radiusPill: "999px",
      cardBorder: "none",
      density: "comfortable",
      meterHeight: "12px",
      tile: "filled",
    },
    dark: {
      bg: "#0d1430",
      surface: "#17204a",
      raised: "#222d5e",
      line: "#2c3870",
      controlBorder: "#7482c4",
      text: "#eef0ff",
      muted: "#adb6e0",
      accent: "#4462f0",
      onAccent: "#ffffff",
      accentText: "#9fb2ff",
      negative: "#ff9a92",
      negativeTint: "#47203a",
      onNegativeTint: "#ffb0a9",
      positive: "#5fe0a0",
      positiveTint: "#173d45",
      onPositiveTint: "#6ff0b0",
      warning: "#ffc261",
      focus: "#b4c3ff",
      meterTrack: "#2c3870",
      meterFill: "#7c95ff",
      meterNear: "#ffb547",
      meterOver: "#ff7a85",
    },
    light: {
      bg: "#eef1fd",
      surface: "#ffffff",
      raised: "#e3e8fb",
      line: "#d3daf5",
      controlBorder: "#7480b0",
      text: "#141a3a",
      muted: "#4c5480",
      accent: "#3651d8",
      onAccent: "#ffffff",
      accentText: "#2f47c4",
      negative: "#c2263a",
      negativeTint: "#fde6ea",
      onNegativeTint: "#a3172b",
      positive: "#127a46",
      positiveTint: "#ddf5e8",
      onPositiveTint: "#0e6539",
      warning: "#965400",
      focus: "#2f47c4",
      meterTrack: "#dde3fa",
      meterFill: "#3651d8",
      meterNear: "#b46500",
      meterOver: "#d6334a",
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
  { label: "Negative on card", fg: "negative", bg: "surface", min: 4.5 },
  {
    label: "Negative pill",
    fg: "onNegativeTint",
    bg: "negativeTint",
    min: 4.5,
  },
  { label: "Positive on card", fg: "positive", bg: "surface", min: 4.5 },
  {
    label: "Positive pill",
    fg: "onPositiveTint",
    bg: "positiveTint",
    min: 4.5,
  },
  { label: "Warning on card", fg: "warning", bg: "surface", min: 4.5 },
  {
    label: "Control border on card",
    fg: "controlBorder",
    bg: "surface",
    min: 3,
  },
  { label: "Focus ring on page", fg: "focus", bg: "bg", min: 3 },
  { label: "Focus ring on card", fg: "focus", bg: "surface", min: 3 },
  { label: "Primary button on card", fg: "accent", bg: "surface", min: 3 },
  { label: "Meter fill on card", fg: "meterFill", bg: "surface", min: 3 },
  { label: "Meter fill on track", fg: "meterFill", bg: "meterTrack", min: 3 },
  { label: "Meter nearly on card", fg: "meterNear", bg: "surface", min: 3 },
  { label: "Meter over on card", fg: "meterOver", bg: "surface", min: 3 },
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
