import { z } from 'zod'

/**
 * org-ascipio wire protocol v1.
 *
 * This file is the runtime-validated mirror of docs/PROTOCOL.md — the two
 * must be kept in sync by hand, since the Emacs side is not generated from
 * this schema. Every message crossing the websocket boundary is parsed
 * through one of these schemas; unknown/malformed messages are dropped
 * (logged, not thrown) so a future protocol addition on one side never
 * crashes the other.
 */

export const GraphNodeSchema = z.object({
  id: z.string(),
  file: z.string(),
  title: z.string(),
  level: z.number().int(),
  pos: z.number().int(),
  olp: z.array(z.string()).nullable(),
  tags: z.array(z.string()),
  properties: z.record(z.string(), z.string()),
  todo: z.string().nullable(),
  priority: z.string().nullable(),
  scheduled: z.string().nullable(),
  deadline: z.string().nullable(),
  backlinks: z.array(z.string()),
})
export type GraphNode = z.infer<typeof GraphNodeSchema>

export const LinkTypeSchema = z.enum(['id', 'cite', 'ref', 'parent', 'heading'])
export type LinkType = z.infer<typeof LinkTypeSchema>

export const GraphLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: LinkTypeSchema,
})
export type GraphLink = z.infer<typeof GraphLinkSchema>

export const GraphSnapshotSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  links: z.array(GraphLinkSchema),
  tags: z.array(z.string()),
})
export type GraphSnapshot = z.infer<typeof GraphSnapshotSchema>

export const GraphPatchSchema = z.object({
  upsertNodes: z.array(GraphNodeSchema),
  removeNodeIds: z.array(z.string()),
  upsertLinks: z.array(GraphLinkSchema),
  removeLinks: z.array(GraphLinkSchema.pick({ source: true, target: true, type: true })),
})
export type GraphPatch = z.infer<typeof GraphPatchSchema>

export const ThemeTokensSchema = z.object({
  mode: z.enum(['dark', 'light']),
  bg: z.string(),
  bgAlt: z.string(),
  bgElevated: z.string(),
  fg: z.string(),
  fgAlt: z.string(),
  fgMuted: z.string(),
  border: z.string(),
  accent: z.object({
    red: z.string(),
    orange: z.string(),
    yellow: z.string(),
    green: z.string(),
    cyan: z.string(),
    blue: z.string(),
    violet: z.string(),
    magenta: z.string(),
  }),
  todoColors: z.record(z.string(), z.string()).optional(),
})
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>

export const EmacsVariablesSchema = z.object({
  roamDir: z.string(),
  subDirs: z.array(z.string()),
})
export type EmacsVariables = z.infer<typeof EmacsVariablesSchema>

/**
 * Real Emacs defcustoms (`org-ascipio-default-*` in org-ascipio.el), pushed
 * once on connect as the frontend's initial settings. This is the other
 * half of "export as elisp": the UI's export just serializes the current
 * in-browser settings back into `setq` calls for these exact variables, so
 * pasting the export into an init file genuinely round-trips -- it is not
 * a cosmetic snippet disconnected from what Emacs actually reads.
 */
export const PhysicsSettingsSchema = z.object({
  enabled: z.boolean(),
  chargeStrength: z.number(),
  linkDistance: z.number(),
  linkStrength: z.number(),
  centeringStrength: z.number(),
  collideRadius: z.number(),
  alphaDecay: z.number(),
  velocityDecay: z.number(),
})
export type PhysicsSettingsWire = z.infer<typeof PhysicsSettingsSchema>

export const ColorModeSchema = z.enum(['tag', 'todo', 'plain'])
export const GraphViewModeSchema = z.enum(['global', 'local'])

export const ConfigDefaultsSchema = z.object({
  physics: PhysicsSettingsSchema,
  colorMode: ColorModeSchema,
  graphViewMode: GraphViewModeSchema,
  localGraphWidgetEnabled: z.boolean(),
})
export type ConfigDefaults = z.infer<typeof ConfigDefaultsSchema>

/**
 * Agenda views are NOT reimplemented client-side. `key` is dispatched
 * straight to `(org-agenda nil key)` in Emacs -- "a" (agenda) and "t"
 * (global TODO list) are always available; everything else comes directly
 * from the user's own `org-agenda-custom-commands`. There is deliberately
 * no client-side scheduling/matching logic: the whole point is that this
 * is Emacs's real agenda engine, not a reimplementation of it.
 */
export const AgendaViewSchema = z.object({
  key: z.string(),
  description: z.string(),
})
export type AgendaView = z.infer<typeof AgendaViewSchema>

export const AgendaLineSchema = z.object({
  text: z.string(),
  isHeader: z.boolean(),
  todo: z.string().nullable(),
  priority: z.string().nullable(),
  tags: z.array(z.string()),
  file: z.string().nullable(),
  pos: z.number().int().nullable(),
  id: z.string().nullable(),
})
export type AgendaLine = z.infer<typeof AgendaLineSchema>

export const FollowCommandSchema = z.object({
  commandName: z.literal('follow'),
  id: z.string(),
})
export const LocalCommandSchema = z.object({
  commandName: z.literal('local'),
  id: z.string(),
})
export const ZoomCommandSchema = z.object({
  commandName: z.literal('zoom'),
  id: z.string(),
  speed: z.number().optional(),
  padding: z.number().optional(),
})
export const CommandDataSchema = z.discriminatedUnion('commandName', [
  FollowCommandSchema,
  LocalCommandSchema,
  ZoomCommandSchema,
])
export type CommandData = z.infer<typeof CommandDataSchema>
