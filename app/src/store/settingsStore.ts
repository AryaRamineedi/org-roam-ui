import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultPhysicsSettings, PhysicsSettings } from '../graph/physics'
import { ConfigDefaults } from '../protocol/schema'

export type GraphViewMode = 'global' | 'local'

interface SettingsState {
  physics: PhysicsSettings
  setPhysics: (patch: Partial<PhysicsSettings>) => void
  resetPhysics: () => void

  /** Whether the always-visible local-graph corner widget renders at all. */
  localGraphWidgetEnabled: boolean
  setLocalGraphWidgetEnabled: (enabled: boolean) => void

  /** Whether the *main* canvas shows the whole graph or is replaced by a
   *  full-size local-graph view -- independent of the corner widget. */
  graphViewMode: GraphViewMode
  setGraphViewMode: (mode: GraphViewMode) => void

  /** Distraction-free mode: hides all chrome except the graph itself. */
  focusMode: boolean
  setFocusMode: (enabled: boolean) => void

  /** True once this browser has ever received `config:defaults` from
   *  Emacs and applied it -- after that, reconnecting doesn't silently
   *  clobber whatever the user has since tweaked in the UI (persisted
   *  settings win); the last-seen Emacs config stays available for the
   *  explicit "Reset to Emacs defaults" action in the Settings panel. */
  initializedFromEmacs: boolean
  lastEmacsDefaults: ConfigDefaults | null
  /** Called on every `config:defaults` message; applies it only the very
   *  first time, otherwise just remembers it for manual reset. */
  receiveEmacsDefaults: (config: ConfigDefaults, applyColorMode: (mode: ConfigDefaults['colorMode']) => void) => void
  /** Re-applies the last config Emacs sent, overwriting current settings. */
  resetToEmacsDefaults: (applyColorMode: (mode: ConfigDefaults['colorMode']) => void) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      physics: defaultPhysicsSettings,
      setPhysics: (patch) => set((state) => ({ physics: { ...state.physics, ...patch } })),
      resetPhysics: () => set({ physics: defaultPhysicsSettings }),

      localGraphWidgetEnabled: true,
      setLocalGraphWidgetEnabled: (enabled) => set({ localGraphWidgetEnabled: enabled }),

      graphViewMode: 'global',
      setGraphViewMode: (mode) => set({ graphViewMode: mode }),

      focusMode: false,
      setFocusMode: (enabled) => set({ focusMode: enabled }),

      initializedFromEmacs: false,
      lastEmacsDefaults: null,
      receiveEmacsDefaults: (config, applyColorMode) => {
        set({ lastEmacsDefaults: config })
        if (!get().initializedFromEmacs) {
          set({
            physics: config.physics,
            graphViewMode: config.graphViewMode,
            localGraphWidgetEnabled: config.localGraphWidgetEnabled,
            initializedFromEmacs: true,
          })
          applyColorMode(config.colorMode)
        }
      },
      resetToEmacsDefaults: (applyColorMode) => {
        const config = get().lastEmacsDefaults
        if (!config) return
        set({
          physics: config.physics,
          graphViewMode: config.graphViewMode,
          localGraphWidgetEnabled: config.localGraphWidgetEnabled,
        })
        applyColorMode(config.colorMode)
      },
    }),
    { name: 'org-ascipio-settings' },
  ),
)
