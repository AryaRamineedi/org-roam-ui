// org-ascipio standalone shell.
//
// A thin Tauri wrapper: the window's content is the same static `dist/`
// build that Emacs's simple-httpd server serves for the browser/xwidget run
// modes (see tauri.conf.json `build.frontendDist`), and the webview inside
// it connects out to `ws://127.0.0.1:35903` exactly the same way, using the
// same AscipioClient code (app/src/connection/client.ts) -- Tauri never
// spawns or embeds Emacs itself, it is purely a native window around the
// same web app.
//
// Native OS integration (tray icon, deep links, custom window chrome) is
// explicitly out of scope for this shell for now -- see the architecture
// plan's Phase 6.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running org-ascipio");
}
