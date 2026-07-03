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
;; `deadline' columns -- those are pulled here so the graph itself can
;; surface task metadata (the real agenda view is a separate, more
;; authoritative pass-through to `org-agenda' -- see the Agenda section
;; below -- these DB columns are just for coloring/labeling graph nodes).
;; Backlinks are precomputed here (dest -> [source
;; ids]) rather than left for the frontend to derive from the flat links
;; array, which is what the old project did on every graph update.
;;
;; Citation/reference link handling (org-roam-bibtex integration, `cite'/
;; `ref' link types) and `/img/:file' + a general file-link resolver
;; pipeline (auto-detecting org-attach/org-download/relative/absolute paths,
;; per the architecture plan) are intentionally not implemented yet --
;; documented gaps, not oversights; see docs/PROTOCOL.md. Likewise, full
;; graph resend on every save (rather than a diffed `graph:patch') is a
;; deliberate MVP simplification pending incremental-update support.

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

;;;; Default frontend settings
;;
;; These are pushed to every client on connect as the `config:defaults'
;; message and become the frontend's initial physics/view/color settings
;; (see docs/PROTOCOL.md). The web UI's "export as elisp" feature
;; (Settings panel) generates `setq' forms for exactly these variables, so
;; configuring the app in the browser and exporting it back into your init
;; file is a real round trip, not a disconnected cosmetic snippet: the
;; values you export are read back by this same code on the next connect.

(defcustom org-ascipio-default-physics-enabled t
  "Whether the graph's force simulation runs live by default.
When nil, the frontend still lays the graph out once (so it never renders
as an unreadable scattered mess) but doesn't keep animating it."
  :group 'org-ascipio
  :type 'boolean)

(defcustom org-ascipio-default-physics-charge -120
  "Default node repulsion strength (more negative = nodes push apart harder)."
  :group 'org-ascipio
  :type 'number)

(defcustom org-ascipio-default-physics-link-distance 90
  "Default target distance between linked nodes."
  :group 'org-ascipio
  :type 'number)

(defcustom org-ascipio-default-physics-link-strength 0.4
  "Default strength (0-1) pulling linked nodes toward `link-distance'."
  :group 'org-ascipio
  :type 'number)

(defcustom org-ascipio-default-physics-centering 0.05
  "Default pull toward the canvas center; 0 disables it (\"gravity off\")."
  :group 'org-ascipio
  :type 'number)

(defcustom org-ascipio-default-physics-collide-radius 10
  "Default minimum separation between node centers; 0 disables it."
  :group 'org-ascipio
  :type 'number)

(defcustom org-ascipio-default-physics-alpha-decay 0.02
  "Default simulation cooling rate -- higher settles faster."
  :group 'org-ascipio
  :type 'number)

(defcustom org-ascipio-default-physics-velocity-decay 0.35
  "Default per-tick friction (0-1) applied to node velocity."
  :group 'org-ascipio
  :type 'number)

(defcustom org-ascipio-default-color-mode "tag"
  "Default node coloring mode: \"tag\", \"todo\", or \"plain\"."
  :group 'org-ascipio
  :type '(choice (const "tag") (const "todo") (const "plain")))

(defcustom org-ascipio-default-graph-view-mode "global"
  "Default graph view: \"global\" (whole graph) or \"local\" (focused node's
neighborhood only, filling the main canvas)."
  :group 'org-ascipio
  :type '(choice (const "global") (const "local")))

(defcustom org-ascipio-default-local-widget-enabled t
  "Whether the always-visible local-graph corner widget shows by default."
  :group 'org-ascipio
  :type 'boolean)

(defun org-ascipio--default-config ()
  "Build the `config:defaults' payload from the `org-ascipio-default-*' variables."
  `((physics . ((enabled . ,(if org-ascipio-default-physics-enabled t json-false))
                (chargeStrength . ,org-ascipio-default-physics-charge)
                (linkDistance . ,org-ascipio-default-physics-link-distance)
                (linkStrength . ,org-ascipio-default-physics-link-strength)
                (centeringStrength . ,org-ascipio-default-physics-centering)
                (collideRadius . ,org-ascipio-default-physics-collide-radius)
                (alphaDecay . ,org-ascipio-default-physics-alpha-decay)
                (velocityDecay . ,org-ascipio-default-physics-velocity-decay)))
    (colorMode . ,org-ascipio-default-color-mode)
    (graphViewMode . ,org-ascipio-default-graph-view-mode)
    (localGraphWidgetEnabled . ,(if org-ascipio-default-local-widget-enabled t json-false))))

(defvar org-ascipio--ws-server nil
  "The websocket server process for org-ascipio.")

(defvar org-ascipio--ws-clients nil
  "List of currently open websocket client connections.")

(defvar org-ascipio--follow-last-node-id nil
  "The last node id sent via a `follow' command, to dedupe redundant sends.")

(defvar org-ascipio--follow-timer nil
  "Pending debounce timer for the next `follow' send, if any.")

(defvar org-ascipio--theme-push-timer nil
  "Pending debounce timer for the next theme push, if any.")

;; Forward declaration: `org-ascipio-mode' is defined much later (in the
;; Entrypoint section) via `define-minor-mode', but the theme-sync code
;; above it needs to check whether it's currently enabled.
(defvar org-ascipio-mode)


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

(defun org-ascipio-db-get-text (id)
  "Return the raw org text of the node ID (narrowed to its heading, if any).
Ported from the old org-roam-ui--get-text: file-level nodes (level 0) return
the whole buffer; heading nodes are narrowed to just that subtree."
  (let* ((node (org-roam-populate (org-roam-node-create :id id)))
         (file (org-roam-node-file node)))
    (org-roam-with-temp-buffer file
      (when (> (org-roam-node-level node) 0)
        (goto-char (org-roam-node-point node))
        (org-narrow-to-element))
      (buffer-substring-no-properties (point-min) (point-max)))))


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
  (org-ascipio-server--send ws "theme" (org-ascipio-theme-tokens))
  (org-ascipio-server--send ws "agenda:views" `((views . ,(org-ascipio-agenda-available-views))))
  (org-ascipio-server--send ws "config:defaults" (org-ascipio--default-config))
  (when org-ascipio-follow
    (org-ascipio-follow-mode 1))
  (message "[org-ascipio] client connected"))

(defun org-ascipio-server--on-close (ws)
  "Unregister WS on disconnect."
  (setq org-ascipio--ws-clients (delq ws org-ascipio--ws-clients))
  (message "[org-ascipio] client disconnected"))

(defun org-ascipio-server--open-file-pos (file pos)
  "Open FILE in Emacs at POS, splitting the window (shared by node/agenda opens)."
  (let ((buf (find-file-noselect file)))
    (unless (> (length (window-list)) 1)
      (split-window-horizontally))
    (other-window 1)
    (set-window-buffer (selected-window) buf)
    (when pos (goto-char pos))))

(defun org-ascipio-server--handle-open (data)
  "Open the location referenced by DATA in Emacs, splitting the window.
DATA is either `{id}' (an org-roam node) or `{file, pos}' (a plain agenda
entry, which may not have -- and does not need -- an org-roam id)."
  (cond
   ((alist-get 'id data)
    (when-let ((node (org-roam-node-from-id (alist-get 'id data))))
      (org-ascipio-server--open-file-pos (org-roam-node-file node) (org-roam-node-point node))))
   ((alist-get 'file data)
    (org-ascipio-server--open-file-pos (alist-get 'file data) (alist-get 'pos data)))))

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
      ("agenda:run" (org-ascipio-server--handle-agenda-run data))
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

(defservlet* node/:id text/plain ()
  "Serve the raw org text of node ID, for the frontend's note-preview sidebar."
  (condition-case err
      (insert (org-ascipio-db-get-text (org-link-decode id)))
    (error (insert (format "org-ascipio: could not load node %s (%s)" id err))))
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
  (add-hook 'after-save-hook #'org-ascipio-server--on-save)
  (add-hook 'enable-theme-functions #'org-ascipio-theme--schedule-push))

(defun org-ascipio-server-stop ()
  "Stop the org-ascipio HTTP + websocket servers."
  (remove-hook 'after-save-hook #'org-ascipio-server--on-save)
  (remove-hook 'enable-theme-functions #'org-ascipio-theme--schedule-push)
  (when org-ascipio--theme-push-timer
    (cancel-timer org-ascipio--theme-push-timer)
    (setq org-ascipio--theme-push-timer nil))
  (when org-ascipio--ws-server
    (websocket-server-close org-ascipio--ws-server)
    (setq org-ascipio--ws-server nil))
  (setq org-ascipio--ws-clients nil)
  (httpd-stop))


;;;; Agenda: a thin pass-through to Emacs's own org-agenda, not a
;;;; reimplementation of it

;; The frontend does not compute schedules, matches, or sorting itself --
;; every view (including any the user has defined in
;; `org-agenda-custom-commands') is dispatched straight to `org-agenda',
;; and the resulting agenda buffer is captured line-by-line (text plus the
;; `org-hd-marker'/`todo-state'/`tags'/`priority' text properties org-agenda
;; already attaches to each entry line) and shipped to the frontend as
;; plain data. This is deliberate: a client-side reimplementation of
;; scheduling/matching logic would only ever support a subset of what real
;; org-agenda does (repeaters, habits, custom skip functions, per-user
;; `org-agenda-custom-commands', etc.), so instead of shipping a
;; half-complete agenda, org-ascipio does not compute agenda semantics at
;; all -- it only asks Emacs to and displays the answer.

(require 'org-agenda)

(defun org-ascipio-agenda-available-views ()
  "Return the agenda views selectable from the frontend.
Always includes the global TODO list (`t') and the day/week agenda (`a');
everything else comes directly from the user's own
`org-agenda-custom-commands' -- these need no interactive input (their
match/settings are already baked into the command definition), unlike the
built-in `m'/`s' single-key commands which normally prompt for a match
string, so those two are intentionally not offered here."
  (vconcat
   (append
    '(((key . "a") (description . "Agenda (day/week)"))
      ((key . "t") (description . "Global TODO list")))
    (mapcar
     (lambda (cmd) `((key . ,(format "%s" (car cmd)))
                      (description . ,(or (nth 1 cmd) (format "%s" (car cmd))))))
     ;; Only single-key top-level commands are offered -- prefix-key
     ;; sub-menus (a cons whose second element is a string naming a
     ;; sub-menu, not a search type) aren't directly dispatchable the same
     ;; way and are skipped.
     (seq-filter (lambda (cmd) (and (nth 2 cmd) (not (stringp (nth 2 cmd)))))
                 org-agenda-custom-commands)))))

(defun org-ascipio-agenda--line-tags (pos)
  "Return the tags text property at POS as a list of plain strings."
  (seq-map (lambda (tag) (substring-no-properties tag)) (or (get-text-property pos 'tags) nil)))

(defun org-ascipio-agenda--marker-id (marker)
  "Return the org-id at MARKER's buffer position, if any."
  (when (and marker (marker-buffer marker))
    (with-current-buffer (marker-buffer marker)
      (save-excursion
        (goto-char marker)
        (org-id-get)))))

(defun org-ascipio-agenda--line-priority (text)
  "Extract a human `[#A]'-style priority letter from agenda line TEXT, if any.
The `priority' text property org-agenda sets is a composite sort key (not
a character code), so it's not meaningful to decode directly -- the
priority cookie in the rendered text itself is the reliable source."
  (when (string-match "\\[#\\([A-Za-z0-9]+\\)\\]" text)
    (match-string 1 text)))

(defun org-ascipio-agenda--capture-buffer ()
  "Capture the current `org-agenda' buffer as a list of AgendaLine alists."
  (let (lines)
    (save-excursion
      (goto-char (point-min))
      (while (not (eobp))
        (let* ((line-start (point))
               (text (buffer-substring-no-properties line-start (line-end-position)))
               (marker (or (get-text-property line-start 'org-hd-marker)
                           (get-text-property line-start 'org-marker))))
          (unless (string-empty-p (string-trim text))
            (push
             `((text . ,text)
               (isHeader . ,(if marker json-false t))
               (todo . ,(get-text-property line-start 'todo-state))
               (priority . ,(org-ascipio-agenda--line-priority text))
               (tags . ,(vconcat (org-ascipio-agenda--line-tags line-start)))
               (file . ,(when marker (buffer-file-name (marker-buffer marker))))
               (pos . ,(when marker (marker-position marker)))
               (id . ,(org-ascipio-agenda--marker-id marker)))
             lines)))
        (forward-line 1)))
    (nreverse lines)))

(defun org-ascipio-agenda-run (key)
  "Run the org-agenda view KEY and return its content as AgendaLine alists.
Builds the real `org-agenda' buffer (via the user's actual configuration)
in a way that avoids disturbing the current window layout, then tears it
back down immediately after capturing it."
  (save-window-excursion
    (save-excursion
      (org-agenda nil key)
      (unwind-protect
          (with-current-buffer (get-buffer org-agenda-buffer-name)
            (org-ascipio-agenda--capture-buffer))
        (when (get-buffer org-agenda-buffer-name)
          (with-current-buffer org-agenda-buffer-name
            (org-agenda-quit)))))))

(defun org-ascipio-server--handle-agenda-run (data)
  "Run the agenda view named in DATA and broadcast the result."
  (when-let ((key (alist-get 'key data)))
    (org-ascipio-server-broadcast
     "agenda:result"
     `((key . ,key) (lines . ,(vconcat (org-ascipio-agenda-run key)))))))


;;;; Theme sync: mirror the current Emacs theme into the web UI

;; Unlike the old org-roam-ui (which required manually running `M-x
;; org-roam-ui-sync-theme' after every theme change, and only reliably
;; extracted colors from Doom themes via `doom-themes--colors'), this hooks
;; `enable-theme-functions' -- built into Emacs 27.1+, fires on every
;; `load-theme'/`enable-theme' call -- so it happens automatically, and
;; treats face-based extraction as the PRIMARY path (works with any theme,
;; Doom or not), using Doom's color table only to enrich specific named
;; accents when available.

(defcustom org-ascipio-sync-theme t
  "Whether to automatically push Emacs's current theme to connected clients."
  :group 'org-ascipio
  :type 'boolean)

(defcustom org-ascipio-theme-debounce-seconds 0.15
  "Idle delay before pushing a theme change.
Coalesces rapid re-themes (some theme-loading sequences fire
`enable-theme-functions' more than once in quick succession, e.g.
disabling all themes then enabling one)."
  :group 'org-ascipio
  :type 'number)

(defun org-ascipio-theme--resolve (face attribute)
  "Resolve ATTRIBUTE (`foreground' or `background') of FACE to a real color.
Returns nil (not the literal \"unspecified-fg\"/\"unspecified-bg\" strings
Emacs uses internally as placeholders) if FACE does not set it."
  (let ((color (if (eq attribute 'foreground)
                    (face-foreground face nil t)
                  (face-background face nil t))))
    (unless (member color '(nil "unspecified-fg" "unspecified-bg"))
      color)))

(defun org-ascipio-theme--face-color (face attribute &optional default)
  "Resolve ATTRIBUTE (`foreground' or `background') of FACE, walking inheritance.
Falls back to DEFAULT, then to the `default' face's own color, then to a
hardcoded sane color, if FACE does not set that attribute (this last
fallback matters in practice: some minimal faces/themes leave attributes
genuinely unspecified even with a real display attached)."
  (or (org-ascipio-theme--resolve face attribute)
      default
      (org-ascipio-theme--resolve 'default attribute)
      (if (eq attribute 'foreground) "#e6ebf5" "#0b0f17")))

(defun org-ascipio-theme--mode ()
  "Return \"dark\" or \"light\" based on the current frame's background mode."
  (if (eq (frame-parameter nil 'background-mode) 'light) "light" "dark"))

(defun org-ascipio-theme--doom-color (name fallback)
  "Look up NAME in `doom-themes--colors' when bound and non-nil, else FALLBACK."
  (or (and (bound-and-true-p doom-themes--colors)
           (cadr (assq name doom-themes--colors)))
      fallback))

(defun org-ascipio-theme--todo-colors ()
  "Map org TODO keywords to colors, from `org-todo-keyword-faces' when set."
  (let (result)
    (dolist (cell org-todo-keyword-faces)
      (let* ((face-spec (cdr cell))
             (color (cond
                     ((stringp face-spec) face-spec)
                     ((facep face-spec) (face-foreground face-spec nil t))
                     ((and (listp face-spec) (plist-get face-spec :foreground))
                      (plist-get face-spec :foreground)))))
        (when color (push (cons (car cell) color) result))))
    (if result result (make-hash-table :size 0)))) ; encodes as `{}', not `null'

(defun org-ascipio-theme-tokens ()
  "Build a ThemeTokens alist (see docs/PROTOCOL.md) from the current Emacs theme."
  (let* ((fg (org-ascipio-theme--face-color 'default 'foreground))
         (bg (org-ascipio-theme--face-color 'default 'background))
         (bg-alt (org-ascipio-theme--face-color 'mode-line-inactive 'background bg))
         (bg-elevated (org-ascipio-theme--face-color 'mode-line 'background bg-alt))
         (fg-alt (org-ascipio-theme--face-color 'font-lock-comment-face 'foreground fg))
         (fg-muted (org-ascipio-theme--face-color 'shadow 'foreground fg-alt))
         (border (org-ascipio-theme--face-color 'vertical-border 'foreground bg-alt)))
    `((mode . ,(org-ascipio-theme--mode))
      (bg . ,bg)
      (bgAlt . ,bg-alt)
      (bgElevated . ,bg-elevated)
      (fg . ,fg)
      (fgAlt . ,fg-alt)
      (fgMuted . ,fg-muted)
      (border . ,border)
      (accent . ((red . ,(org-ascipio-theme--doom-color 'red (org-ascipio-theme--face-color 'error 'foreground)))
                 (orange . ,(org-ascipio-theme--doom-color 'orange (org-ascipio-theme--face-color 'warning 'foreground)))
                 (yellow . ,(org-ascipio-theme--doom-color 'yellow (org-ascipio-theme--face-color 'font-lock-builtin-face 'foreground)))
                 (green . ,(org-ascipio-theme--doom-color 'green (org-ascipio-theme--face-color 'success 'foreground)))
                 (cyan . ,(org-ascipio-theme--doom-color 'cyan (org-ascipio-theme--face-color 'font-lock-constant-face 'foreground)))
                 (blue . ,(org-ascipio-theme--doom-color 'blue (org-ascipio-theme--face-color 'font-lock-keyword-face 'foreground)))
                 (violet . ,(org-ascipio-theme--doom-color 'violet (org-ascipio-theme--face-color 'font-lock-type-face 'foreground)))
                 (magenta . ,(org-ascipio-theme--doom-color 'magenta (org-ascipio-theme--face-color 'font-lock-preprocessor-face 'foreground)))))
      (todoColors . ,(org-ascipio-theme--todo-colors)))))

(defun org-ascipio-theme--push ()
  "Broadcast the current theme to all connected clients."
  (when (and org-ascipio-mode org-ascipio-sync-theme)
    (org-ascipio-server-broadcast "theme" (org-ascipio-theme-tokens))))

(defun org-ascipio-theme--schedule-push (&rest _)
  "Debounce a theme push via `org-ascipio-theme-debounce-seconds'."
  (when org-ascipio--theme-push-timer
    (cancel-timer org-ascipio--theme-push-timer))
  (setq org-ascipio--theme-push-timer
        (run-with-idle-timer
         org-ascipio-theme-debounce-seconds nil
         (lambda ()
           (setq org-ascipio--theme-push-timer nil)
           (org-ascipio-theme--push)))))

;;;###autoload
(defun org-ascipio-sync-theme ()
  "Manually push the current Emacs theme to connected org-ascipio clients.
Not usually needed since `enable-theme-functions' triggers this
automatically, but useful as an escape hatch -- e.g. after tweaking
individual faces with `set-face-attribute' rather than loading a whole
theme, since that does not fire `enable-theme-functions'."
  (interactive)
  (org-ascipio-theme--push))


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
