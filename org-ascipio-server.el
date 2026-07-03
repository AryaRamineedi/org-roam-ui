;;; org-ascipio-server.el --- websocket + HTTP server for org-ascipio -*- lexical-binding: t; -*-

;; Copyright (C) 2026 org-ascipio contributors

;;; Commentary:

;; Two local-only transports, per docs/PROTOCOL.md:
;;
;;  - WebSocket (`org-ascipio-ws-port', default 35903): all structured, live,
;;    bidirectional data -- graph snapshots/patches, commands.
;;  - HTTP (`org-ascipio-http-port', default 35901): serves the static
;;    frontend build (`org-ascipio-dist-dir') for the browser and
;;    xwidget-webkit run modes, plus a `/health' endpoint.
;;
;; `/node/:id' and `/img/:file' (raw org text / image serving, and the
;; pluggable file-link resolver pipeline described in the architecture plan)
;; are Phase 3 work, tied to the note-content rendering pipeline -- not
;; implemented yet.
;;
;; Full graph resend on every save (rather than a diffed `graph:patch') is a
;; deliberate, documented MVP simplification; see org-ascipio-diff.el (not
;; yet implemented) for the planned incremental-update follow-up.

;;; Code:

(require 'websocket)
(require 'simple-httpd)
(require 'json)
(require 'org-ascipio-db)

(defcustom org-ascipio-ws-port 35903
  "Port for the org-ascipio websocket server."
  :group 'org-ascipio
  :type 'integer)

(defcustom org-ascipio-http-port 35901
  "Port for the org-ascipio HTTP server (serves the static frontend build)."
  :group 'org-ascipio
  :type 'integer)

(defcustom org-ascipio-dist-dir
  (expand-file-name "dist" (file-name-directory (or load-file-name buffer-file-name)))
  "Directory containing the built org-ascipio frontend (index.html, assets/)."
  :group 'org-ascipio
  :type 'directory)

(defvar org-ascipio--ws-server nil
  "The websocket server process for org-ascipio.")

(defvar org-ascipio--ws-clients nil
  "List of currently open websocket client connections.")

(defun org-ascipio-server--send (ws type data)
  "Send a versioned {v, type, data} envelope message over WS."
  (when (websocket-openp ws)
    (websocket-send-text
     ws
     (json-encode `((v . 1) (type . ,type) (data . ,data))))))

(defun org-ascipio-server-broadcast (type data)
  "Send a versioned {v, type, data} message to every connected client."
  (dolist (ws org-ascipio--ws-clients)
    (org-ascipio-server--send ws type data)))

(defun org-ascipio-server--send-graph-init (ws)
  "Send a full GraphSnapshot to WS as a `graph:init' message."
  (org-ascipio-server--send ws "graph:init" (org-ascipio-db-get-snapshot)))

(defun org-ascipio-server--on-open (ws)
  "Register WS as a client and push initial state to it."
  (push ws org-ascipio--ws-clients)
  (org-ascipio-server--send-graph-init ws)
  (when (fboundp 'org-ascipio-follow-mode)
    (org-ascipio-follow-mode 1))
  (message "[org-ascipio] client connected"))

(defun org-ascipio-server--on-close (ws)
  "Unregister WS on disconnect."
  (setq org-ascipio--ws-clients (delq ws org-ascipio--ws-clients))
  (message "[org-ascipio] client disconnected"))

(defun org-ascipio-server--handle-open (data)
  "Open the node referenced by DATA's `id' in Emacs, splitting the window."
  (when-let* ((id (alist-get 'id data))
              (node (org-roam-node-from-id id)))
    (let* ((pos (org-roam-node-point node))
           (buf (find-file-noselect (org-roam-node-file node))))
      (unless (> (length (window-list)) 1)
        (split-window-horizontally))
      (other-window 1)
      (set-window-buffer (selected-window) buf)
      (goto-char pos))))

(defun org-ascipio-server--handle-delete (data)
  "Delete the file referenced by DATA and resync, then push a fresh snapshot."
  (when-let ((file (alist-get 'file data)))
    (delete-file file)
    (org-roam-db-sync)
    (org-ascipio-server-broadcast "graph:init" (org-ascipio-db-get-snapshot))))

(defun org-ascipio-server--handle-create (data)
  "Create a new org-roam node from DATA's `title'."
  (when-let ((title (alist-get 'title data)))
    (org-roam-capture-
     :node (org-roam-node-create :title title)
     :props '(:finalize find-file))))

(defun org-ascipio-server--on-message (_ws frame)
  "Dispatch an incoming client {command, data} message from FRAME."
  (let* ((msg (condition-case err
                  (json-parse-string (websocket-frame-text frame) :object-type 'alist)
                (error
                 (message "[org-ascipio] dropped malformed client message: %s" err)
                 nil)))
         (command (and msg (alist-get 'command msg)))
         (data (and msg (alist-get 'data msg))))
    (pcase command
      ("open" (org-ascipio-server--handle-open data))
      ("delete" (org-ascipio-server--handle-delete data))
      ("create" (org-ascipio-server--handle-create data))
      (`nil nil)
      (_ (message "[org-ascipio] unknown client command: %s" command)))))

(defun org-ascipio-server--on-save ()
  "Push a fresh full GraphSnapshot after saving an org-roam file.
Deliberately unconditional/full-resend for the MVP -- see the file
commentary above and docs/PROTOCOL.md for the planned `graph:patch' diffing."
  (when (and org-ascipio--ws-clients (org-roam-buffer-p))
    (org-ascipio-server-broadcast "graph:init" (org-ascipio-db-get-snapshot)))
  ;; run-hooks contract: always return nil so this composes safely with
  ;; other after-save-hook functions.
  nil)

(defservlet* health text/plain ()
  (insert "ok")
  (httpd-send-header t "text/plain" 200 :Access-Control-Allow-Origin "*"))

(defun org-ascipio-server-start ()
  "Start the org-ascipio HTTP + websocket servers."
  (setq-local httpd-port org-ascipio-http-port)
  (setq httpd-root org-ascipio-dist-dir)
  (httpd-start)
  (setq org-ascipio--ws-server
        (websocket-server
         org-ascipio-ws-port
         :host 'local
         :on-open #'org-ascipio-server--on-open
         :on-message #'org-ascipio-server--on-message
         :on-close #'org-ascipio-server--on-close))
  (add-hook 'after-save-hook #'org-ascipio-server--on-save))

(defun org-ascipio-server-stop ()
  "Stop the org-ascipio HTTP + websocket servers."
  (remove-hook 'after-save-hook #'org-ascipio-server--on-save)
  (when org-ascipio--ws-server
    (websocket-server-close org-ascipio--ws-server)
    (setq org-ascipio--ws-server nil))
  (setq org-ascipio--ws-clients nil)
  (httpd-stop))

(provide 'org-ascipio-server)
;;; org-ascipio-server.el ends here
