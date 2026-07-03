import { create } from 'zustand'
import { AgendaLine, AgendaView } from '../protocol/schema'

/**
 * State for the agenda view -- a thin pass-through to Emacs's own
 * org-agenda (see org-ascipio.el's Agenda section and docs/PROTOCOL.md).
 * There is no client-side schedule/match computation here at all: `views`
 * is whatever Emacs reports as available (built-ins + the user's own
 * `org-agenda-custom-commands`), and `lines` is the literal captured
 * agenda buffer for whichever view was last run.
 */
interface AgendaState {
  views: AgendaView[]
  setViews: (views: AgendaView[]) => void

  selectedKey: string | null
  setSelectedKey: (key: string | null) => void

  lines: AgendaLine[] | null
  loading: boolean
  lastKey: string | null
  setResult: (key: string, lines: AgendaLine[]) => void
  setLoading: (loading: boolean) => void
}

export const useAgendaStore = create<AgendaState>((set) => ({
  views: [],
  setViews: (views) => set({ views }),

  selectedKey: null,
  setSelectedKey: (key) => set({ selectedKey: key }),

  lines: null,
  loading: false,
  lastKey: null,
  setResult: (key, lines) => set({ lines, lastKey: key, loading: false }),
  setLoading: (loading) => set({ loading }),
}))
