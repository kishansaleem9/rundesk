import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useAuthStore } from '../store/auth'

/**
 * §15 Skills — the client half.
 *
 * Types mirror the server's rows rather than being invented here, because the
 * one thing that reliably rots is a second definition of the same shape.
 */
export interface Skill {
  id: string
  workspaceId: string
  createdById: string
  name: string
  description: string | null
  instructions: string
  archetype: 'scratch' | 'delegate_like_me' | 'brand_voice' | 'triage_like_me'
  visibility: 'private' | 'workspace'
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface SkillTemplate {
  archetype: Skill['archetype']
  title: string
  description: string
  instructions: string
  tone: 'neutral' | 'coral' | 'green' | 'blue'
}

export interface SkillMemory {
  id: string
  skillId: string
  authorId: string | null
  content: string
  source: 'chat' | 'manual'
  createdAt: string
}

export interface SkillConnection {
  id: string
  skillId: string
  provider: string
  connectionId: string | null
  config: Record<string, unknown>
  createdAt: string
  /** Null until an admin connects the provider — a state, not an error. */
  status: string | null
  account: string | null
}

export type SkillTab = 'all' | 'enabled' | 'mine'

const base = (workspaceId: string) => `/workspaces/${workspaceId}/skills`

export const skillKeys = {
  list: (workspaceId: string, tab: SkillTab) => ['skills', workspaceId, tab] as const,
  counts: (workspaceId: string) => ['skills', workspaceId, 'counts'] as const,
  templates: (workspaceId: string) => ['skills', workspaceId, 'templates'] as const,
  one: (workspaceId: string, id: string) => ['skills', workspaceId, 'one', id] as const,
  memories: (workspaceId: string, id: string) => ['skills', workspaceId, 'memories', id] as const,
  connections: (workspaceId: string, id: string) =>
    ['skills', workspaceId, 'connections', id] as const,
}

export function useSkills(workspaceId: string, tab: SkillTab) {
  return useQuery({
    queryKey: skillKeys.list(workspaceId, tab),
    queryFn: () => api<Skill[]>(`${base(workspaceId)}?tab=${tab}`),
    enabled: !!workspaceId,
  })
}

export function useSkillCounts(workspaceId: string) {
  return useQuery({
    queryKey: skillKeys.counts(workspaceId),
    queryFn: () => api<{ all: number; enabled: number; mine: number }>(`${base(workspaceId)}/counts`),
    enabled: !!workspaceId,
  })
}

export function useSkillTemplates(workspaceId: string) {
  return useQuery({
    queryKey: skillKeys.templates(workspaceId),
    queryFn: () => api<SkillTemplate[]>(`${base(workspaceId)}/templates`),
    enabled: !!workspaceId,
    // The carousel copy only changes when we ship, so stop refetching it.
    staleTime: Infinity,
  })
}

export function useSkill(workspaceId: string, id: string) {
  return useQuery({
    queryKey: skillKeys.one(workspaceId, id),
    queryFn: () => api<Skill>(`${base(workspaceId)}/${id}`),
    enabled: !!workspaceId && !!id,
  })
}

export function useSkillMemories(workspaceId: string, id: string) {
  return useQuery({
    queryKey: skillKeys.memories(workspaceId, id),
    queryFn: () => api<SkillMemory[]>(`${base(workspaceId)}/${id}/memories`),
    enabled: !!workspaceId && !!id,
  })
}

export function useSkillConnections(workspaceId: string, id: string) {
  return useQuery({
    queryKey: skillKeys.connections(workspaceId, id),
    queryFn: () => api<SkillConnection[]>(`${base(workspaceId)}/${id}/connections`),
    enabled: !!workspaceId && !!id,
  })
}

/**
 * One invalidator for every skill mutation.
 *
 * Every list, count and tab derives from the same rows, so a mutation that
 * refreshes only the tab you happen to be on leaves the other two showing the
 * old world until you reload — which reads as "it didn't save".
 */
function useSkillInvalidator(workspaceId: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['skills', workspaceId] })
}

export function useCreateSkill(workspaceId: string) {
  const invalidate = useSkillInvalidator(workspaceId)
  return useMutation({
    mutationFn: (input: Partial<Skill>) =>
      api<Skill>(base(workspaceId), { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
}

export function useUpdateSkill(workspaceId: string, id: string) {
  const invalidate = useSkillInvalidator(workspaceId)
  return useMutation({
    mutationFn: (patch: Partial<Skill>) =>
      api<Skill>(`${base(workspaceId)}/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  })
}

export function useDeleteSkill(workspaceId: string) {
  const invalidate = useSkillInvalidator(workspaceId)
  return useMutation({
    mutationFn: (id: string) => api(`${base(workspaceId)}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useAddSkillMemory(workspaceId: string, id: string) {
  const invalidate = useSkillInvalidator(workspaceId)
  return useMutation({
    mutationFn: (content: string) =>
      api<SkillMemory>(`${base(workspaceId)}/${id}/memories`, {
        method: 'POST',
        body: { content, source: 'manual' },
      }),
    onSuccess: invalidate,
  })
}

export function useRemoveSkillMemory(workspaceId: string, id: string) {
  const invalidate = useSkillInvalidator(workspaceId)
  return useMutation({
    mutationFn: (memoryId: string) =>
      api(`${base(workspaceId)}/${id}/memories/${memoryId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useAddSkillConnection(workspaceId: string, id: string) {
  const invalidate = useSkillInvalidator(workspaceId)
  return useMutation({
    mutationFn: (input: { provider: string; connectionId?: string }) =>
      api<SkillConnection>(`${base(workspaceId)}/${id}/connections`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: invalidate,
  })
}

export function useRemoveSkillConnection(workspaceId: string, id: string) {
  const invalidate = useSkillInvalidator(workspaceId)
  return useMutation({
    mutationFn: (rowId: string) =>
      api(`${base(workspaceId)}/${id}/connections/${rowId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

// ─── §15 — the AI drafting a skill for you, [18:17]–[18:42] ─────────────────

/** A lookup the server actually performed, reported as it finished. */
export interface ProposalStep {
  label: string
  finding?: string
}

export interface SkillProposal {
  name: string
  description: string
  instructions: string
  memories: string[]
  rationale: string
  steps: ProposalStep[]
  followUps: string[]
}

/**
 * Ask for a draft. Nothing is written — the reply is a proposal to approve.
 *
 * Server-sent events rather than one response, because the steps arrive before
 * the answer does and that ordering is the whole point of showing them: you see
 * what it read, and *then* what it concluded.
 */
export async function proposeSkill(
  workspaceId: string,
  request: string,
  handlers: { onStep?: (step: ProposalStep) => void; signal?: AbortSignal } = {},
): Promise<{ proposal: SkillProposal; message: string }> {
  const token = useAuthStore.getState().accessToken
  const res = await fetch('/api/v1/ai/skills/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspaceId, request }),
    signal: handlers.signal,
  })
  if (!res.ok || !res.body) {
    const reason = await res
      .clone()
      .json()
      .then((b: { message?: string; error?: string }) => b?.message ?? b?.error)
      .catch(() => undefined)
    throw new Error(reason || 'Could not draft a skill')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: { proposal: SkillProposal; message: string } | null = null

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    // Chunk boundaries fall anywhere, so hold the tail until it completes —
    // splitting on every read drops any event that straddles two chunks.
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload === '[DONE]') continue
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(payload)
      } catch {
        continue
      }
      if (parsed.error) throw new Error(String(parsed.error))
      if (parsed.step) handlers.onStep?.(parsed.step as ProposalStep)
      if (parsed.proposal) result = parsed as unknown as { proposal: SkillProposal; message: string }
    }
  }

  if (!result) throw new Error('The draft did not come back')
  return result
}

/**
 * The approval — "Approve this approach and I'll create it" (frame `t1146`).
 * One call, so a skill is never created without the memory it was approved with.
 */
export function useCreateSkillFromProposal(workspaceId: string) {
  const invalidate = useSkillInvalidator(workspaceId)
  return useMutation({
    mutationFn: (proposal: Pick<SkillProposal, 'name' | 'description' | 'instructions' | 'memories'>) =>
      api<Skill & { memoriesCreated: number }>(`${base(workspaceId)}/from-proposal`, {
        method: 'POST',
        body: proposal,
      }),
    onSuccess: invalidate,
  })
}
