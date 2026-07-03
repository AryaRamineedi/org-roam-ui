;;; org-ascipio-follow.el --- drive the web UI camera from point in Emacs -*- lexical-binding: t; -*-

;; Copyright (C) 2026 org-ascipio contributors

;;; Commentary:

;; Watches `post-command-hook' for point moving into a new org-roam node and
;; pushes a `follow' command over the websocket, which the frontend's
;; CameraController (app/src/graph/CameraController.ts) uses to pan/zoom to
;; it. `post-command-hook' fires on literally every command, so this
;; dedupes by node id (as the old org-roam-ui did) AND debounces with a
;; short idle timer, so rapid cursor movement (e.g. holding C-n) doesn't
;; flood the websocket -- one half of the fix for the old project's
;; "infinite zoom" bug; the other half (debounce/clamp/cancel-in-flight on
;; the frontend) lives in CameraController.ts.

;;; Code:

(require 'org-roam)
(require 'org-ascipio-server)

(defcustom org-ascipio-follow-debounce-seconds 0.15
  "Idle delay before pushing a `follow' command after point moves."
  :group 'org-ascipio
  :type 'number)

(defvar org-ascipio--follow-last-node-id nil
  "The last node id sent via a `follow' command, to dedupe redundant sends.")

(defvar org-ascipio--follow-timer nil
  "Pending debounce timer for the next `follow' send, if any.")

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

(provide 'org-ascipio-follow)
;;; org-ascipio-follow.el ends here
