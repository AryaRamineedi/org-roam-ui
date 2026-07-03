import { ThemeTokens } from '../protocol/schema'

/**
 * Graph-specific colors derived from the current ThemeTokens, kept as a
 * plain mutable module-level object (like graphData.ts's `graph` singleton)
 * rather than React/Zustand state -- graph/graphReducers.ts reads this on
 * every Sigma render call, which must stay outside React's render cycle.
 * Updated by theme/applyTheme.ts whenever a new theme (from Emacs or a
 * built-in preset) is applied.
 */
export interface GraphThemeColors {
  nodeDefault: string
  edgeDefault: string
  dim: string
  selected: string
  hoverHighlight: string
  background: string
  /** The 8 semantic accent colors, in a stable order -- used to hash tags
   *  and TODO states to consistent colors (graph/nodeColor.ts). */
  accentPalette: string[]
  /** From org-todo-keyword-faces, when Emacs supplies it; empty otherwise. */
  todoColors: Record<string, string>
}

const DEFAULT_ACCENTS = ['#ef5b5b', '#f5a742', '#f5da42', '#5bd67e', '#4fd6d0', '#5b8def', '#a684f2', '#e05bd0']

const DEFAULT_DARK: GraphThemeColors = {
  nodeDefault: '#4fd6d0',
  edgeDefault: 'rgba(148, 163, 184, 0.35)',
  dim: 'rgba(148, 163, 184, 0.15)',
  selected: '#f5b942',
  hoverHighlight: '#e6ebf5',
  background: '#0b0f17',
  accentPalette: DEFAULT_ACCENTS,
  todoColors: {},
}

export const graphTheme: GraphThemeColors = { ...DEFAULT_DARK, accentPalette: [...DEFAULT_ACCENTS] }

/** Converts a `#rrggbb` color to `rgba(r, g, b, alpha)`; passes through anything else unchanged. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return hex
  const int = parseInt(match[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function updateGraphTheme(tokens: ThemeTokens): void {
  graphTheme.nodeDefault = tokens.accent.cyan
  graphTheme.edgeDefault = withAlpha(tokens.fgMuted, 0.35)
  graphTheme.dim = withAlpha(tokens.fgMuted, 0.15)
  graphTheme.selected = tokens.accent.orange
  graphTheme.hoverHighlight = tokens.fg
  graphTheme.background = tokens.bg
  graphTheme.accentPalette = [
    tokens.accent.red,
    tokens.accent.orange,
    tokens.accent.yellow,
    tokens.accent.green,
    tokens.accent.cyan,
    tokens.accent.blue,
    tokens.accent.violet,
    tokens.accent.magenta,
  ]
  graphTheme.todoColors = tokens.todoColors ?? {}
}
