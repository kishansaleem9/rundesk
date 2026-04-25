import { create } from 'zustand'
import type { FlagKey } from '@rundesk/feature-flags'

export type Workspace = {
  id: string
  name: string
  slug: string
  role: string
}

type WorkspaceState = {
  active: Workspace | null
  workspaces: Workspace[]
  flags: Record<string, boolean>
  setWorkspaces: (list: Workspace[]) => void
  setActive: (ws: Workspace | null) => void
  setFlags: (flags: Record<string, boolean>) => void
  isFlagEnabled: (key: FlagKey) => boolean
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  active: null,
  workspaces: [],
  flags: {},
  setWorkspaces: (workspaces) => set({ workspaces }),
  setActive: (active) => set({ active }),
  setFlags: (flags) => set({ flags }),
  isFlagEnabled: (key) => !!get().flags[key],
}))
