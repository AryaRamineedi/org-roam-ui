import { z } from 'zod'
import {
  CommandDataSchema,
  EmacsVariablesSchema,
  GraphPatchSchema,
  GraphSnapshotSchema,
  ThemeTokensSchema,
} from './schema'

const V1 = z.literal(1)

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ v: V1, type: z.literal('graph:init'), data: GraphSnapshotSchema }),
  z.object({ v: V1, type: z.literal('graph:patch'), data: GraphPatchSchema }),
  z.object({ v: V1, type: z.literal('variables'), data: EmacsVariablesSchema }),
  z.object({ v: V1, type: z.literal('theme'), data: ThemeTokensSchema }),
  z.object({ v: V1, type: z.literal('command'), data: CommandDataSchema }),
  z.object({ v: V1, type: z.literal('error'), data: z.object({ message: z.string() }) }),
])
export type ServerMessage = z.infer<typeof ServerMessageSchema>

export const ClientMessageSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('open'), data: z.object({ id: z.string() }) }),
  z.object({ command: z.literal('delete'), data: z.object({ id: z.string(), file: z.string() }) }),
  z.object({ command: z.literal('create'), data: z.object({ title: z.string(), ref: z.string().optional() }) }),
])
export type ClientMessage = z.infer<typeof ClientMessageSchema>

/**
 * Parses a raw websocket payload against the protocol schema. Returns null
 * (and logs) on any malformed/unrecognized message instead of throwing, so a
 * message type introduced by a newer client or server never crashes the
 * other side — see docs/PROTOCOL.md "forward compatibility."
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const result = ServerMessageSchema.safeParse(raw)
  if (!result.success) {
    console.warn('[org-ascipio] dropped malformed server message', raw, result.error.issues)
    return null
  }
  return result.data
}
