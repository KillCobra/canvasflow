/** Parses #rgb, #rgba, #rrggbb and #rrggbbaa. Anything else reads as black. */
function parseHex(hex: string) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Black or white, whichever reads better on `hex`. */
export function contrastInk(hex: string) {
  const { r, g, b } = parseHex(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111111' : '#FFFFFF';
}
