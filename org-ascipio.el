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
;; This single file is the entire Emacs half of org-ascipio: `M-x
;; org-ascipio-mode' starts a websocket server (live org-roam graph data +
;; UI commands) and an HTTP server (the static frontend build), both
;; local-only. See docs/PROTOCOL.md for the wire protocol and the
;; repository README for the full architecture, roadmap, and Doom Emacs
;; installation instructions.
;;
;; Deliberately expands on the old org-roam-ui's node query
;; (`org-roam-ui--get-nodes'), which only selected
;; [id file title level pos olp properties tags] even though org-roam's
;; `nodes' table has always had `todo', `priority', `scheduled', and
;; `deadline' columns -- those are pulled here so a future task/agenda view
;; has real data to work with, and today's graph payload already carries
;; them for future UI use. Backlinks are precomputed here (dest -> [source
;; ids]) rather than left for the frontend to derive from the flat links
;; array, which is what the old project did on every graph update.
;;
;; Citation/reference link handling (org-roam-bibtex integration, `cite'/
;; `ref' link types) and `/node/:id' + `/img/:file' (raw org text / image
;; serving, and the pluggable file-link resolver pipeline described in the
;; architecture plan) are intentionally not implemented yet -- documented
;; gaps, not oversights; see docs/PROTOCOL.md. Likewise, full graph resend
;; on every save (rather than a diffed `graph:patch') is a deliberate MVP
;; simplification pending incremental-update support.

;;; Code:

(require 'org-roam)
(require 'websocket)
(require 'simple-httpd)
(require 'json)
(require 'cl-lib)

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

(defcustom org-ascipio-follow-debounce-seconds 0.15
  "Idle delay before pushing a `follow' command after point moves."
  :group 'org-ascipio
  :type 'number)

(defvar org-ascipio--ws-server nil
  "The websocket server process for org-ascipio.")

(defvar org-ascipio--ws-clients nil
  "List of currently open websocket client connections.")

(defvar org-ascipio--follow-last-node-id nil
  "The last node id sent via a `follow' command, to dedupe redundant sends.")

(defvar org-ascipio--follow-timer nil
  "Pending debounce timer for the next `follow' send, if any.")


;;;; org-roam DB access

(defun org-ascipio-db--nil-if-empty (value)
  "Normalize VALUE to nil when it is nil or an empty string."
  (if (and (stringp value) (string-empty-p value))
      nil
    value))

(defun org-ascipio-db--olp (olp)
  "Normalize an OLP value from the database to a list or nil."
  (cond
   ((null olp) nil)
   ((vectorp olp) (append olp nil))
   ((listp olp) olp)
   (t nil)))

(defun org-ascipio-db--properties (properties)
  "Normalize a PROPERTIES alist from the database to a plist-friendly alist.
Keys are coerced to strings and values to strings so the JSON encoder
produces a plain string->string object, matching the protocol's
`Record<string, string>' type for `properties'."
  (let (result)
    (dolist (cell properties)
      (push (cons (format "%s" (car cell)) (format "%s" (cdr cell))) result))
    (nreverse result)))

(defun org-ascipio-db--get-node-rows ()
  "Query org-roam's `nodes' table with the expanded column list."
  (org-roam-db-query
   [:select [id file title level pos olp properties todo priority scheduled deadline]
    :from nodes]))

(defun org-ascipio-db--get-tags-by-node ()
  "Return a hash table mapping node id -> list of tags."
  (let ((table (make-hash-table :test #'equal)))
    (dolist (row (org-roam-db-query [:select [node-id tag] :from tags]))
      (let ((id (nth 0 row))
            (tag (nth 1 row)))
        (puthash id (cons tag (gethash id table)) table)))
    table))

(defun org-ascipio-db--get-id-links ()
  "Return all `id'-type links as a list of (source dest) pairs."
  (org-roam-db-query
   [:select [source dest] :from links :where (= type "id")]))

(defun org-ascipio-db--build-backlink-table (links)
  "Build a hash table mapping node id -> node ids linking to it, from LINKS."
  (let ((table (make-hash-table :test #'equal)))
    (dolist (link links)
      (let ((source (nth 0 link))
            (dest (nth 1 link)))
        (puthash dest (cons source (gethash dest table)) table)))
    table))

(defun org-ascipio-db--node-alist (row tags-table backlinks-table)
  "Build the protocol's GraphNode alist from ROW, TAGS-TABLE, and BACKLINKS-TABLE."
  (cl-destructuring-bind (id file title level pos olp properties todo priority scheduled deadline) row
    `((id . ,id)
      (file . ,file)
      (title . ,(or (org-ascipio-db--nil-if-empty title) file))
      (level . ,level)
      (pos . ,pos)
      (olp . ,(vconcat (org-ascipio-db--olp olp)))
      (tags . ,(vconcat (gethash id tags-table)))
      (properties . ,(if-let ((props (org-ascipio-db--properties properties)))
                          props
                        (make-hash-table :size 0))) ; encodes as `{}', not `null' or `[]'
      (todo . ,(org-ascipio-db--nil-if-empty todo))
      (priority . ,(org-ascipio-db--nil-if-empty priority))
      (scheduled . ,(org-ascipio-db--nil-if-empty scheduled))
      (deadline . ,(org-ascipio-db--nil-if-empty deadline))
      (backlinks . ,(vconcat (gethash id backlinks-table))))))

(defun org-ascipio-db--link-alist (link)
  "Build the protocol's GraphLink alist from LINK, a (source dest) pair."
  `((source . ,(nth 0 link))
    (target . ,(nth 1 link))
    (type . "id")))

(defun org-ascipio-db-get-snapshot ()
  "Return a full GraphSnapshot alist: {nodes, links, tags}, per docs/PROTOCOL.md."
  (let* ((tags-table (org-ascipio-db--get-tags-by-node))
         (links (org-ascipio-db--get-id-links))
         (backlinks-table (org-ascipio-db--build-backlink-table links))
         (node-rows (org-ascipio-db--get-node-rows))
         (all-tags (delete-dups
                    (seq-mapcat (lambda (row) (copy-sequence (gethash (nth 0 row) tags-table)))
                                node-rows))))
    `((nodes . ,(vconcat (mapcar (lambda (row)
                                    (org-ascipio-db--node-alist row tags-table backlinks-table))
                                  node-rows)))
      (links . ,(vconcat (mapcar #'org-ascipio-db--link-alist links)))
      (tags . ,(vconcat all-tags)))))


;;;; HTTP + websocket server

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
  (when org-ascipio-follow
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


;;;; Follow mode: drive the web UI camera from point in Emacs

;; Watches `post-command-hook' for point moving into a new org-roam node and
;; pushes a `follow' command over the websocket, which the frontend's
;; CameraController (app/src/graph/CameraController.ts) uses to pan/zoom to
;; it. `post-command-hook' fires on literally every command, so this
;; dedupes by node id (as the old org-roam-ui did) AND debounces with a
;; short idle timer, so rapid cursor movement (e.g. holding C-n) doesn't
;; flood the websocket -- one half of the fix for the old project's
;; "infinite zoom" bug; the other half (debounce/clamp/cancel-in-flight on
;; the frontend) lives in CameraController.ts.

(defun org-ascipio-follow--send-current-node ()
  "Send a `follow' command for the org-roam node at point, if it changed."
  (setq org-ascipio--follow-timer nil)
  (when-let* ((node (org-roam-node-at-point))
              (id (org-roam-node-id node)))
    (unless (equal id org-ascipio--follow-last-node-id)
      (setq org-ascipio--follow-last-node-id id)
      (org-ascipio-server-broadcast "command" `((commandName . "follow") (id . ,id))))))

(defun org-ascipio-follow--maybe-update ()
  "Debounce a `follow' send for the current buffer's node at point."
  (when (org-roam-buffer-p)
    (when org-ascipio--follow-timer
      (cancel-timer org-ascipio--follow-timer))
    (setq org-ascipio--follow-timer
          (run-with-idle-timer org-ascipio-follow-debounce-seconds nil
                                #'org-ascipio-follow--send-current-node))))

;;;###autoload
(define-minor-mode org-ascipio-follow-mode
  "Push the org-roam node at point to connected org-ascipio clients."
  :global t
  :group 'org-ascipio
  (if org-ascipio-follow-mode
      (add-hook 'post-command-hook #'org-ascipio-follow--maybe-update)
    (remove-hook 'post-command-hook #'org-ascipio-follow--maybe-update)
    (when org-ascipio--follow-timer
      (cancel-timer org-ascipio--follow-timer)
      (setq org-ascipio--follow-timer nil))))


;;;; Entrypoint

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
