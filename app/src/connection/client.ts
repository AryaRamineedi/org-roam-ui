import { ClientMessage, ServerMessage, parseServerMessage } from '../protocol/messages'

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'reconnecting'

export interface AscipioClientOptions {
  url?: string
  onMessage: (message: ServerMessage) => void
  onStatusChange?: (status: ConnectionStatus) => void
}

const DEFAULT_URL = 'ws://127.0.0.1:35903'
const MAX_BACKOFF_MS = 10_000
const BASE_BACKOFF_MS = 500

/**
 * Thin typed wrapper around a plain WebSocket: validates every inbound
 * message against the protocol schema and reconnects with exponential
 * backoff. No third-party reconnect library — we own both ends of the
 * protocol now, so a ~60-line client with zod validation baked in is a
 * better fit than a generic wrapper with no schema awareness.
 */
export class AscipioClient {
  private ws: WebSocket | null = null
  private readonly url: string
  private readonly onMessage: (message: ServerMessage) => void
  private readonly onStatusChange?: (status: ConnectionStatus) => void
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closedByUser = false

  constructor(options: AscipioClientOptions) {
    this.url = options.url ?? DEFAULT_URL
    this.onMessage = options.onMessage
    this.onStatusChange = options.onStatusChange
  }

  connect(): void {
    this.closedByUser = false
    this.open()
  }

  private open(): void {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.addEventListener('open', () => {
      this.attempt = 0
      this.setStatus('open')
    })

    ws.addEventListener('message', (event) => {
      let raw: unknown
      try {
        raw = JSON.parse(event.data)
      } catch {
        console.warn('[org-ascipio] received non-JSON websocket message')
        return
      }
      const message = parseServerMessage(raw)
      if (message) this.onMessage(message)
    })

    ws.addEventListener('close', () => {
      this.setStatus('closed')
      if (!this.closedByUser) this.scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      ws.close()
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.attempt, MAX_BACKOFF_MS)
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closedByUser) this.open()
    }, delay)
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('[org-ascipio] dropped outbound message, socket not open', message)
    }
  }

  close(): void {
    this.closedByUser = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }

  private setStatus(status: ConnectionStatus): void {
    this.onStatusChange?.(status)
  }
}
