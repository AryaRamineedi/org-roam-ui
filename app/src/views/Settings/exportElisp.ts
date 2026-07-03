import { PhysicsSettings } from '../../graph/physics'
import { ColorMode } from '../../graph/nodeColor'
import { GraphViewMode } from '../../store/settingsStore'

/**
 * Serializes the current in-browser settings into `setq` forms for the
 * exact `org-ascipio-default-*` defcustoms org-ascipio.el reads to build
 * the `config:defaults' message (see org-ascipio.el's "Default frontend
 * settings" section). This is a real round trip, not a disconnected
 * cosmetic snippet: pasting this into your init file makes the next
 * connection start with precisely these settings.
 */
export function exportSettingsAsElisp(settings: {
  physics: PhysicsSettings
  colorMode: ColorMode
  graphViewMode: GraphViewMode
  localGraphWidgetEnabled: boolean
}): string {
  const { physics, colorMode, graphViewMode, localGraphWidgetEnabled } = settings
  return `;; org-ascipio settings, exported from the web UI.
;; Paste into your init file (after (require 'org-ascipio)) so future
;; connections start with these instead of the built-in defaults.

(setq org-ascipio-default-physics-enabled ${physics.enabled ? 't' : 'nil'})
(setq org-ascipio-default-physics-charge ${physics.chargeStrength})
(setq org-ascipio-default-physics-link-distance ${physics.linkDistance})
(setq org-ascipio-default-physics-link-strength ${physics.linkStrength})
(setq org-ascipio-default-physics-centering ${physics.centeringStrength})
(setq org-ascipio-default-physics-collide-radius ${physics.collideRadius})
(setq org-ascipio-default-physics-alpha-decay ${physics.alphaDecay})
(setq org-ascipio-default-physics-velocity-decay ${physics.velocityDecay})
(setq org-ascipio-default-color-mode "${colorMode}")
(setq org-ascipio-default-graph-view-mode "${graphViewMode}")
(setq org-ascipio-default-local-widget-enabled ${localGraphWidgetEnabled ? 't' : 'nil'})
`
}
