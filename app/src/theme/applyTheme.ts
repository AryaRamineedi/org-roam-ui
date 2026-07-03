import { ThemeTokens } from '../protocol/schema'
import { updateGraphTheme } from '../graph/graphTheme'

const ACCENT_KEYS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta'] as const

/**
 * The single theming entry point: writes every token as a CSS custom
 * property on `<html>` (instant, no-reload reskinning for all UI chrome,
 * since every Tailwind color in this app resolves through `var(...)`), and
 * updates graph/graphTheme.ts so the next Sigma refresh re-colors nodes/
 * edges too. Called identically whether the source is a live push from
 * Emacs (org-ascipio.el's theme sync) or a built-in preset
 * (theme/presets.ts) -- there is only one theming code path.
 */
export function applyTheme(tokens: ThemeTokens): void {
  const root = document.documentElement
  root.style.setProperty('--ascipio-bg', tokens.bg)
  root.style.setProperty('--ascipio-bg-alt', tokens.bgAlt)
  root.style.setProperty('--ascipio-bg-elevated', tokens.bgElevated)
  root.style.setProperty('--ascipio-fg', tokens.fg)
  root.style.setProperty('--ascipio-fg-alt', tokens.fgAlt)
  root.style.setProperty('--ascipio-fg-muted', tokens.fgMuted)
  root.style.setProperty('--ascipio-border', tokens.border)
  for (const key of ACCENT_KEYS) {
    root.style.setProperty(`--ascipio-accent-${key}`, tokens.accent[key])
  }
  root.dataset.ascipioThemeMode = tokens.mode

  updateGraphTheme(tokens)
}
