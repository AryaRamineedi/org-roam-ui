import { create } from 'zustand'
import { ConnectionStatus } from '../connection/client'
import { EmacsVariables, ThemeTokens } from '../protocol/schema'

interface AppState {
  connectionStatus: ConnectionStatus
  setConnectionStatus: (status: ConnectionStatus) => void

  /** Node id currently active (last `follow`/`zoom`/click target). */
  activeNodeId: string | null
  setActiveNodeId: (id: string | null) => void

  /** Bumped on every graph mutation so components can subscribe without
   *  holding the (non-reactive) graphology instance directly. */
  graphVersion: number
  bumpGraphVersion: () => void

  variables: EmacsVariables | null
  setVariables: (variables: EmacsVariables) => void

  theme: ThemeTokens | null
  setTheme: (theme: ThemeTokens) => void
}

export const useAppStore = create<AppState>((set) => ({
  connectionStatus: 'connecting',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  activeNodeId: null,
  setActiveNodeId: (id) => set({ activeNodeId: id }),

  graphVersion: 0,
  bumpGraphVersion: () => set((state) => ({ graphVersion: state.graphVersion + 1 })),

  variables: null,
  setVariables: (variables) => set({ variables }),

  theme: null,
  setTheme: (theme) => set({ theme }),
}))
