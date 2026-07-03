import { create } from 'zustand'
import { ConnectionStatus } from '../connection/client'
import { ClientMessage } from '../protocol/messages'
import { EmacsVariables, ThemeTokens } from '../protocol/schema'

export type ViewMode = 'graph' | 'agenda'

export interface Filters {
  /** Tags in this set hide any node carrying them (and their exclusive edges). */
  excludedTags: string[]
  /** If non-empty, ONLY nodes carrying at least one of these tags are shown. */
  includedTags: string[]
  hideOrphans: boolean
  hideDoneTodos: boolean
}

export const defaultFilters: Filters = {
  excludedTags: [],
  includedTags: [],
  hideOrphans: false,
  hideDoneTodos: false,
}

interface AppState {
  connectionStatus: ConnectionStatus
  setConnectionStatus: (status: ConnectionStatus) => void

  /** Node id currently active (last `follow`/`zoom` target from Emacs). */
  activeNodeId: string | null
  setActiveNodeId: (id: string | null) => void

  /** Node id selected by clicking in the graph or agenda (drives the sidebar). */
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void

  /** Bumped on every graph mutation so components can subscribe without
   *  holding the (non-reactive) graphology instance directly. */
  graphVersion: number
  bumpGraphVersion: () => void

  variables: EmacsVariables | null
  setVariables: (variables: EmacsVariables) => void

  theme: ThemeTokens | null
  setTheme: (theme: ThemeTokens) => void

  /** Set by useAscipioConnection once the client exists; lets any component
   *  dispatch client->server commands without prop-drilling the socket. */
  sendCommand: ((message: ClientMessage) => void) | null
  setSendCommand: (send: ((message: ClientMessage) => void) | null) => void

  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  filters: Filters
  setFilters: (filters: Partial<Filters>) => void

  searchQuery: string
  setSearchQuery: (query: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  connectionStatus: 'connecting',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  activeNodeId: null,
  setActiveNodeId: (id) => set({ activeNodeId: id }),

  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  graphVersion: 0,
  bumpGraphVersion: () => set((state) => ({ graphVersion: state.graphVersion + 1 })),

  variables: null,
  setVariables: (variables) => set({ variables }),

  theme: null,
  setTheme: (theme) => set({ theme }),

  sendCommand: null,
  setSendCommand: (send) => set({ sendCommand: send }),

  viewMode: 'graph',
  setViewMode: (mode) => set({ viewMode: mode }),

  filters: defaultFilters,
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}))
