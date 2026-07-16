// Apply a workspace's brand accent color (Plan §13). The design system's
// primary action color is the CSS var `--brand-700`, stored as space-separated
// HSL ("H S% L%"); we convert the workspace's hex color and override it.

function hexToHsl(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

const DEFAULT_BRAND = '227 54% 45%' // matches --brand-700 in styles.css

/** Set (or reset) the brand accent from a hex color. Pass null/invalid to reset. */
export function applyBrandColor(hex: string | null | undefined): void {
  if (typeof document === 'undefined') return
  const hsl = hex ? hexToHsl(hex) : null
  document.documentElement.style.setProperty('--brand-700', hsl ?? DEFAULT_BRAND)
}

/**
 * Set (or reset) the workspace accent on the `--accent` CSS var. The design
 * system reads it as `hsl(var(--accent))`, so it must be an "H S% L%" triple —
 * exactly what hexToHsl returns. Pass null/invalid to fall back to the default.
 */
export function applyAccentColor(hex: string | null | undefined): void {
  if (typeof document === 'undefined') return
  const hsl = hex ? hexToHsl(hex) : null
  if (hsl) document.documentElement.style.setProperty('--accent', hsl)
  else document.documentElement.style.removeProperty('--accent')
}
