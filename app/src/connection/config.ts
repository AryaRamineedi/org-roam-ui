/**
 * Default endpoints for the Emacs backend, matching org-ascipio.el's
 * defaults (`org-ascipio-ws-port` 35903, `org-ascipio-http-port` 35901).
 * Both are reachable at 127.0.0.1 regardless of run mode (browser,
 * xwidget-webkit, or Tauri) -- see runtime/capabilities.ts.
 */
export const DEFAULT_WS_URL = 'ws://127.0.0.1:35903'
export const DEFAULT_HTTP_BASE_URL = 'http://127.0.0.1:35901'
