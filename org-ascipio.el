;;; org-ascipio.el --- A modern, extensible graph UI for org-roam -*- lexical-binding: t; -*-

;; Copyright (C) 2026 org-ascipio contributors

;; Author: org-ascipio contributors
;; URL: https://github.com/aryaramineedi/org-roam-ui
;; Package-Requires: ((emacs "27.1") (org-roam "2.2.0") (websocket "1.13") (simple-httpd "1.5.1"))
;; Version: 0.1.0
;; Keywords: org-mode, roam, convenience, hypermedia

;;; Commentary:

;; org-ascipio is a from-scratch rewrite of org-roam-ui: a WebGL graph
;; visualization + second-brain UI for org-roam, built to be installed with
;; nothing but Emacs (the frontend's production build ships committed in
;; `dist/'), and run three ways -- inside an Emacs xwidget-webkit buffer, in
;; an external browser, or as a standalone Tauri desktop app.
;;
;; This file is the entrypoint: `M-x org-ascipio-mode' starts the local
;; HTTP + websocket servers (org-ascipio-server.el) that back all three run
;; modes and pushes live org-roam graph data (org-ascipio-db.el) to
;; connected clients.
;;
;; See docs/PROTOCOL.md for the wire protocol and the repository README for
;; the full architecture and roadmap.

;;; Code:

(require 'org-roam)
(require 'org-ascipio-db)
(require 'org-ascipio-server)
(require 'org-ascipio-follow)

(defgroup org-ascipio nil
  "A modern, extensible graph UI for org-roam."
  :group 'org-roam
  :prefix "org-ascipio-")

(defcustom org-ascipio-follow t
  "Whether `org-ascipio-follow-mode' is enabled automatically on client connect."
  :group 'org-ascipio
  :type 'boolean)

(defcustom org-ascipio-open-on-start t
  "Whether to open org-ascipio in a browser when `org-ascipio-mode' is enabled."
  :group 'org-ascipio
  :type 'boolean)

(defcustom org-ascipio-browser-function #'browse-url
  "Function used to open org-ascipio. Called with the app URL as its argument.
Set this to a function that opens `xwidget-webkit-browse-url' to embed
org-ascipio inside an Emacs buffer, on Emacs builds with xwidget support."
  :group 'org-ascipio
  :type 'function)

;;;###autoload
(define-minor-mode org-ascipio-mode
  "Serve the org-ascipio web app and live org-roam graph data.

Starts an HTTP server (serving the static frontend build) and a websocket
server (serving live graph data and receiving UI commands). See
`org-ascipio-http-port' and `org-ascipio-ws-port' to change the defaults,
and docs/PROTOCOL.md for the wire protocol both servers implement."
  :lighter " org-ascipio"
  :global t
  :group 'org-ascipio
  (if org-ascipio-mode
      (progn
        (org-ascipio-server-start)
        (when org-ascipio-open-on-start
          (org-ascipio-open)))
    (org-ascipio-server-stop)
    (org-ascipio-follow-mode -1)))

;;;###autoload
(defun org-ascipio-open ()
  "Open org-ascipio via `org-ascipio-browser-function'."
  (interactive)
  (funcall org-ascipio-browser-function
           (format "http://localhost:%d" org-ascipio-http-port)))

(provide 'org-ascipio)
;;; org-ascipio.el ends here
