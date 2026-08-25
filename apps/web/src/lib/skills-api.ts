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
  installed: (workspaceId: string) => ['skills', workspaceId, 'installed'] as const,
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

/**
 * §15 — the ids this person has installed, in one read.
 *
 * A Set here rather than an `installed` boolean on each skill row: the same
 * skill appears in All Skills and in Enabled, and a flag baked into the row
 * would have to be kept in step across both caches.
 */
export function useInstalledSkillIds(workspaceId: string) {
  return useQuery({
    queryKey: skillKeys.installed(workspaceId),
    queryFn: async () => new Set(await api<string[]>(`${base(workspaceId)}/installed`)),
    enabled: !!workspaceId,
  })
}

export function useSetSkillInstalled(workspaceId: string) {
  const invalidate = useSkillInvalidator(workspaceId)
  return useMutation({
    mutationFn: ({ id, installed }: { id: string; installed: boolean }) =>
      api(`${base(workspaceId)}/${id}/install`, { method: installed ? 'POST' : 'DELETE' }),
    onSuccess: invalidate,
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

/**
 * §15 — a skill's slash command, mirroring the server's `skillSlug`.
 *
 * Two copies of one rule is exactly the thing that rots, so
 * `skill-slug-parity.test.ts` reads the server's implementation and runs both
 * over the same inputs. If they ever disagree the composer offers a command the
 * server will not resolve, which looks like the command being broken.
 */
export function skillSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

/** The installed skills this person can type as /slug, ready for the composer. */
export function useSkillCommands(workspaceId: string) {
  return useQuery({
    queryKey: ['skills', workspaceId, 'commands'],
    queryFn: async () => {
      const rows = await api<Skill[]>(`${base(workspaceId)}?tab=enabled`)
      return rows
        .filter((s) => s.enabled)
        .map((s) => ({ slug: skillSlug(s.name), name: s.name, id: s.id }))
        .filter((s) => s.slug.length > 0)
    },
    enabled: !!workspaceId,
  })
}


// ─── §15 Skills Miner and team discovery — the two functional starter cards ──

export interface MinedSkill extends SkillProposal {
  /** The lines from your own work that suggested this. Never invented. */
  evidence: string[]
}

export interface DiscoverableSkill {
  id: string
  name: string
  description: string | null
  archetype: Skill['archetype']
  createdById: string
  authorName: string | null
  /** How many colleagues already use it — the only signal a newcomer has. */
  installs: number
}

/**
 * "Discover skills created across your workspace."
 *
 * A plain query, not a model call: what a colleague published and you have not
 * picked up is a fact, and asking a model to describe it would be slower and
 * less true.
 */
export function useDiscoverableSkills(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: ['skills', workspaceId, 'discover'],
    queryFn: () => api<DiscoverableSkill[]>(`${base(workspaceId)}/discover`),
    enabled: enabled && !!workspaceId,
  })
}

/**
 * "Skills Miner / Turn repeat work into skills."
 *
 * Streams the scans before the findings, same as the drafter: the card's claim
 * is that it read your work, so what it read arrives first.
 */
export async function mineSkills(
  workspaceId: string,
  handlers: { onStep?: (step: ProposalStep) => void; signal?: AbortSignal } = {},
): Promise<{ skills: MinedSkill[]; message: string }> {
  const token = useAuthStore.getState().accessToken
  const res = await fetch('/api/v1/ai/skills/mine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspaceId }),
    signal: handlers.signal,
  })
  if (!res.ok || !res.body) {
    const reason = await res
      .clone()
      .json()
      .then((b: { message?: string; error?: string }) => b?.message ?? b?.error)
      .catch(() => undefined)
    throw new Error(reason || 'Could not scan your work')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: { skills: MinedSkill[]; message: string } | null = null

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    // Same buffering rule as proposeSkill: an event split across two chunks
    // must not be dropped.
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
      if (Array.isArray(parsed.skills)) {
        result = parsed as unknown as { skills: MinedSkill[]; message: string }
      }
    }
  }

  if (!result) throw new Error('The scan did not come back')
  return result
}


// ─── §15 — AI chats that outlive the panel ──────────────────────────────────

export interface AiChatThread {
  id: string
  title: string
  skillId: string | null
  updatedAt: string
  messageCount: number
}

export interface AiChatMessage {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

const chatBase = (workspaceId: string) => `/workspaces/${workspaceId}/ai-chats`

export const aiChatKeys = {
  list: (workspaceId: string) => ['ai-chats', workspaceId] as const,
  one: (workspaceId: string, id: string) => ['ai-chats', workspaceId, id] as const,
}

export function useAiChatThreads(workspaceId: string) {
  return useQuery({
    queryKey: aiChatKeys.list(workspaceId),
    queryFn: () => api<AiChatThread[]>(chatBase(workspaceId)),
    enabled: !!workspaceId,
  })
}

export function useAiChatThread(workspaceId: string, threadId: string | null) {
  return useQuery({
    queryKey: aiChatKeys.one(workspaceId, threadId ?? ''),
    queryFn: () =>
      api<AiChatThread & { messages: AiChatMessage[] }>(`${chatBase(workspaceId)}/${threadId}`),
    enabled: !!workspaceId && !!threadId,
  })
}

/**
 * Appending is fire-and-forget from the panel's point of view: the message is
 * already on screen, and blocking the conversation on a write nobody is waiting
 * for would make the assistant feel slower than it is. The list is refreshed
 * afterwards so the sidebar picks up the title when one arrives.
 */
export function useAiChatActions(workspaceId: string) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['ai-chats', workspaceId] })
  return {
    create: (skillId?: string) =>
      api<AiChatThread>(chatBase(workspaceId), { method: 'POST', body: { skillId } }).then((t) => {
        refresh()
        return t
      }),
    append: (threadId: string, role: 'user' | 'assistant', content: string) =>
      api<{ message: AiChatMessage; title?: string }>(
        `${chatBase(workspaceId)}/${threadId}/messages`,
        { method: 'POST', body: { role, content } },
      ).then((r) => {
        // Only when a title actually arrived: refreshing on every turn would
        // reorder the sidebar mid-conversation for no visible gain.
        if (r?.title) refresh()
        return r
      }),
    rename: (threadId: string, title: string) =>
      api(`${chatBase(workspaceId)}/${threadId}`, { method: 'PATCH', body: { title } }).then(refresh),
    remove: (threadId: string) =>
      api(`${chatBase(workspaceId)}/${threadId}`, { method: 'DELETE' }).then(refresh),
  }
}
