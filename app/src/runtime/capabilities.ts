/**
 * Capability detection for the three supported run modes (§8 of the
 * architecture plan). Nothing in this app should assume a specific shell —
 * Tauri-only APIs must be gated behind `runtime.isTauri` and dynamically
 * imported so they never load in the xwidget-webkit/browser bundles.
 */
export const runtime = {
  get isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  },
  get isBrowser(): boolean {
    return !this.isTauri
  },
}
