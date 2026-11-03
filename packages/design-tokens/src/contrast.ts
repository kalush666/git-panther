/** WCAG 2.x contrast helpers for validating token pairs. */

function channelToLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function parseOpaqueHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    throw new Error(`Expected an opaque #RRGGBB colour, got "${hex}"`);
  }
  const [, red, green, blue] = match as unknown as [string, string, string, string];
  return [parseInt(red, 16), parseInt(green, 16), parseInt(blue, 16)];
}

export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseOpaqueHex(hex).map(channelToLinear) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}
