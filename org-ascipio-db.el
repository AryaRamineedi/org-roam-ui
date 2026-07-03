;;; org-ascipio-db.el --- org-roam DB access for org-ascipio -*- lexical-binding: t; -*-

;; Copyright (C) 2026 org-ascipio contributors

;;; Commentary:

;; Queries org-roam's SQLite database (never parses org files itself, except
;; where org-ascipio-resolve-link.el later needs raw file content) and
;; assembles it into the org-ascipio wire protocol's GraphSnapshot shape
;; (see docs/PROTOCOL.md).
;;
;; Deliberately expands on the old org-roam-ui's node query
;; (`org-roam-ui--get-nodes`), which only selected
;; [id file title level pos olp properties tags] even though org-roam's
;; `nodes' table has always had `todo', `priority', `scheduled', and
;; `deadline' columns -- those are pulled here so task/agenda features
;; (org-ascipio-agenda.el, a later phase) have real data to work with, and so
;; today's graph payload already carries them for future UI use.
;;
;; Backlinks are precomputed here (dest -> [source ids]) rather than left for
;; the frontend to derive from the flat links array, which is what the old
;; project did on every graph update.
;;
;; Citation/reference link handling (org-roam-bibtex integration, `cite'/`ref'
;; link types) is intentionally not implemented yet -- only `id' links are
;; queried for now. This is a documented gap, not an oversight: see
;; docs/PROTOCOL.md.

;;; Code:

(require 'org-roam)
(require 'cl-lib)

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

(provide 'org-ascipio-db)
;;; org-ascipio-db.el ends here
