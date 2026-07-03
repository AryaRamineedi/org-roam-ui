import { useEffect, useRef } from 'react'
import { AscipioClient } from './client'
import { applyPatch, applySnapshot } from '../graph/graphData'
import { useAppStore } from '../store/appStore'

/**
 * Owns the lifetime of the websocket connection to the Emacs backend and
 * routes incoming messages into the graphology graph singleton / Zustand
 * store. Connects once on mount; reconnect/backoff is handled inside
 * AscipioClient.
 */
export function useAscipioConnection(): void {
  const clientRef = useRef<AscipioClient | null>(null)
  const setConnectionStatus = useAppStore((state) => state.setConnectionStatus)
  const setActiveNodeId = useAppStore((state) => state.setActiveNodeId)
  const bumpGraphVersion = useAppStore((state) => state.bumpGraphVersion)
  const setVariables = useAppStore((state) => state.setVariables)
  const setTheme = useAppStore((state) => state.setTheme)
  const setSendCommand = useAppStore((state) => state.setSendCommand)

  useEffect(() => {
    const client = new AscipioClient({
      onStatusChange: setConnectionStatus,
      onMessage: (message) => {
        switch (message.type) {
          case 'graph:init':
            applySnapshot(message.data)
            bumpGraphVersion()
            return
          case 'graph:patch':
            applyPatch(message.data)
            bumpGraphVersion()
            return
          case 'variables':
            setVariables(message.data)
            return
          case 'theme':
            setTheme(message.data)
            return
          case 'command':
            if (message.data.commandName === 'follow' || message.data.commandName === 'zoom') {
              setActiveNodeId(message.data.id)
            }
            return
          case 'error':
            console.error('[org-ascipio] server error:', message.data.message)
        }
      },
    })
    clientRef.current = client
    client.connect()
    setSendCommand((message) => client.send(message))
    return () => {
      setSendCommand(null)
      client.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
