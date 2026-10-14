import type Anthropic from '@anthropic-ai/sdk'

/**
 * CHATGPT AND GEMINI IN BRAIN'S PICKER (`commit-log/log-39863ff-1`).
 *
 * ClickUp's Brain lets a person pick the model that answers — OpenAI's GPT
 * models, Anthropic's Claude and Google's Gemini, "ChatGPT 5.4 optimized for
 * ClickUp" by default (its help centre, "Select an AI model", through search
 * excerpts, 14 October). Here Claude answers through Anthropic's client, and
 * ChatGPT and Gemini through OpenAI's Chat Completions API, which Gemini speaks
 * too at its OpenAI-compatible address (ai.google.dev, "OpenAI compatibility"):
 * one client, two addresses. Each is offered where its key is set, and listed
 * as not set up where it is not:
 *
 *   ChatGPT  CHATGPT_API_KEY, else OPENAI_API_KEY; CHATGPT_API_URL (OpenAI's
 *            own unless given); CHATGPT_MODEL (`gpt-5.4` unless given)
 *   Gemini   GEMINI_API_KEY; GEMINI_API_URL (Google's OpenAI-compatible address
 *            unless given); GEMINI_MODEL (`gemini-3-flash-preview` unless given)
 *
 * Their own variables beside OPENAI_API_KEY, as the images' are: the embeddings
 * read OPENAI_API_KEY too, and a lane pointing it at a stub would send them
 * there. The lanes and CI point CHATGPT_API_URL at `media-stub.mjs`, which
 * answers in OpenAI's shapes; they set no Gemini key, so the picker's "not set
 * up" row is drawn and refused there too.
 *
 * THE TURN IS CLAUDE'S SHAPE THROUGHOUT. `chatStream` keeps its conversation as
 * Anthropic messages and runs one loop for every provider; `streamChat` takes
 * that conversation, says it in OpenAI's words, and hands back what the loop
 * reads of Anthropic's stream — text deltas while it streams, then a message
 * whose blocks are text and `tool_use`. So the tools, the follow-ups, the
 * metering and the failure path are one code path whoever answers.
 */

export type ChatProviderId = 'openai' | 'google'
export type ChatProviderConfig = { id: ChatProviderId; base: string; key: string; model: string }
export type ChatProviders = Partial<Record<ChatProviderId, ChatProviderConfig>>

const OPENAI_URL = 'https://api.openai.com/v1'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'
export const DEFAULT_CHATGPT_MODEL = 'gpt-5.4'
export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview'

/** Who is named in a refusal: the person reads "ChatGPT", not "openai". */
export const PROVIDER_NAMES: Record<ChatProviderId, string> = { openai: 'ChatGPT', google: 'Gemini' }

/**
 * What a reply may hold, past the visible answer: reasoning models count their
 * thinking against it, so Claude's 2 048 would leave a long answer cut off
 * after the model had thought.
 */
export const OTHER_PROVIDER_MAX_TOKENS = 8192

const trimmed = (v: string | undefined) => (v ?? '').trim()

export function chatProvidersFrom(env: Record<string, string | undefined> = process.env): ChatProviders {
  const out: ChatProviders = {}
  const openaiKey = trimmed(env.CHATGPT_API_KEY) || trimmed(env.OPENAI_API_KEY)
  if (openaiKey) {
    out.openai = {
      id: 'openai',
      key: openaiKey,
      base: (trimmed(env.CHATGPT_API_URL) || OPENAI_URL).replace(/\/+$/, ''),
      model: trimmed(env.CHATGPT_MODEL) || DEFAULT_CHATGPT_MODEL,
    }
  }
  const geminiKey = trimmed(env.GEMINI_API_KEY)
  if (geminiKey) {
    out.google = {
      id: 'google',
      key: geminiKey,
      base: (trimmed(env.GEMINI_API_URL) || GEMINI_URL).replace(/\/+$/, ''),
      model: trimmed(env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL,
    }
  }
  return out
}

// ─── The conversation, in OpenAI's words ────────────────────────────────────

type TextPart = { type: 'text'; text: string }
type ImagePart = { type: 'image_url'; image_url: { url: string } }
type FilePart = { type: 'file'; file: { filename: string; file_data: string } }
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | Array<TextPart | ImagePart | FilePart> }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
    }
  | { role: 'tool'; tool_call_id: string; content: string }
export type ChatTool = { type: 'function'; function: { name: string; description?: string; parameters: unknown } }

const resultText = (content: Anthropic.Messages.ToolResultBlockParam['content']) =>
  typeof content === 'string'
    ? content
    : (content ?? []).map((c) => (c.type === 'text' ? c.text : '')).join('')

/**
 * A turn as Anthropic holds it, as Chat Completions takes it.
 *
 * The system prompt is the first message. An assistant's `tool_use` blocks are
 * its `tool_calls`, their input the JSON of their arguments; a user message's
 * `tool_result` blocks are `tool` messages, one per call and before anything
 * else the message says, since a reply to a tool call must come straight after
 * it. A picture is an `image_url` of its bytes. A PDF is a `file` to OpenAI;
 * Gemini's compatible address takes one as an `image_url` of its bytes.
 */
export function toChatMessages(
  system: string,
  messages: Anthropic.Messages.MessageParam[],
  provider: ChatProviderId = 'openai',
): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push(m.role === 'user' ? { role: 'user', content: m.content } : { role: 'assistant', content: m.content })
      continue
    }
    if (m.role === 'assistant') {
      const text = m.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
      const calls = m.content
        .filter((b): b is Anthropic.Messages.ToolUseBlockParam => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }))
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) })
      continue
    }
    const parts: Array<TextPart | ImagePart | FilePart> = []
    for (const b of m.content) {
      if (b.type === 'tool_result') {
        out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: resultText(b.content) })
      } else if (b.type === 'text') {
        parts.push({ type: 'text', text: b.text })
      } else if (b.type === 'image' && b.source.type === 'base64') {
        parts.push({ type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } })
      } else if (b.type === 'document' && b.source.type === 'base64') {
        const data = `data:application/pdf;base64,${b.source.data}`
        const name = `${(b.title ?? 'document').replace(/\.pdf$/i, '')}.pdf`
        parts.push(provider === 'google' ? { type: 'image_url', image_url: { url: data } } : { type: 'file', file: { filename: name, file_data: data } })
      }
    }
    if (parts.length) {
      out.push({ role: 'user', content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts })
    }
  }
  return out
}

/** Claude's tools as functions: the same name, description and JSON Schema. */
export function toChatTools(tools: readonly Anthropic.Messages.Tool[]): ChatTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, ...(t.description ? { description: t.description } : {}), parameters: t.input_schema },
  }))
}

// ─── The answer, as Anthropic's stream gives it ─────────────────────────────

export type TextDeltaEvent = { type: 'content_block_delta'; delta: { type: 'text_delta'; text: string } }
export type ProviderStream = AsyncIterable<TextDeltaEvent> & { finalMessage(): Promise<Anthropic.Messages.Message> }

/** The provider refused or broke off; `status` is its own, 0 when nothing came back. */
export class ProviderFailed extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** Each `data:` line of a server-sent stream, as it arrives. */
async function* sseData(body: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true })
    let at: number
    while ((at = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, at).replace(/\r$/, '')
      buf = buf.slice(at + 1)
      if (line.startsWith('data:')) yield line.slice(5).trimStart()
    }
  }
  buf += decoder.decode()
  const rest = buf.trim()
  if (rest.startsWith('data:')) yield rest.slice(5).trimStart()
}

type CallSlot = { id: string; name: string; args: string }

/**
 * Gather a stream's tool calls. OpenAI sends each call's pieces under its
 * `index`, its id and name with the first; Gemini's compatible address has been
 * seen sending a whole call in one piece, with no index. A piece with an index
 * goes to that slot; one without goes to the slot of its id, or a new one.
 */
export function gatherToolCall(
  calls: CallSlot[],
  piece: { index?: number; id?: string; function?: { name?: string; arguments?: string } },
) {
  let slot: CallSlot | undefined
  if (typeof piece.index === 'number') {
    slot = calls[piece.index] ??= { id: '', name: '', args: '' }
  } else {
    slot = piece.id ? calls.find((c) => c.id === piece.id) : undefined
    if (!slot) calls.push((slot = { id: '', name: '', args: '' }))
  }
  if (piece.id) slot.id = piece.id
  if (piece.function?.name && !slot.name) slot.name = piece.function.name
  if (piece.function?.arguments) slot.args += piece.function.arguments
}

const parseArguments = (args: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(args || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Ask a provider for one pass of a turn, streamed.
 *
 * Iterating it yields the answer's text as it comes; `finalMessage()` resolves,
 * once the stream has ended, to the pass as an Anthropic message: its text, its
 * tool calls as `tool_use` blocks, and the tokens it cost. A refusal — a key it
 * does not know, a rate limit, a model it does not have — throws a
 * `ProviderFailed` naming the provider and in its own words.
 */
export function streamChat(
  provider: ChatProviderConfig,
  req: { system: string; messages: Anthropic.Messages.MessageParam[]; tools?: readonly Anthropic.Messages.Tool[]; maxTokens?: number },
  fetchImpl: typeof fetch = fetch,
): ProviderStream {
  let text = ''
  const calls: CallSlot[] = []
  let usage = { input: 0, output: 0 }
  let finish: string | null = null
  let resolveFinal!: (m: Anthropic.Messages.Message) => void
  let rejectFinal!: (e: unknown) => void
  const final = new Promise<Anthropic.Messages.Message>((res, rej) => {
    resolveFinal = res
    rejectFinal = rej
  })
  // A stream nobody reads to the end still settles, and an unread rejection is not an unhandled one.
  final.catch(() => undefined)
  const name = PROVIDER_NAMES[provider.id]

  async function* run(): AsyncGenerator<TextDeltaEvent> {
    const body = {
      model: provider.model,
      messages: toChatMessages(req.system, req.messages, provider.id),
      ...(req.tools?.length ? { tools: toChatTools(req.tools) } : {}),
      stream: true,
      // OpenAI's own counts the reply against `max_completion_tokens`; Gemini's compatible address reads `max_tokens`.
      ...(provider.id === 'openai'
        ? { max_completion_tokens: req.maxTokens ?? OTHER_PROVIDER_MAX_TOKENS, stream_options: { include_usage: true } }
        : { max_tokens: req.maxTokens ?? OTHER_PROVIDER_MAX_TOKENS }),
    }
    let res: Response
    try {
      res = await fetchImpl(`${provider.base}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${provider.key}`, 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      })
    } catch (e) {
      throw new ProviderFailed(0, `${name} could not be reached: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => '')
      let said = raw.slice(0, 300)
      try {
        const j = JSON.parse(raw) as { error?: { message?: string } } | Array<{ error?: { message?: string } }>
        said = (Array.isArray(j) ? j[0]?.error?.message : j.error?.message) ?? said
      } catch {
        /* not JSON: its first words say it */
      }
      throw new ProviderFailed(res.status, `${name} answered ${res.status}${said ? `: ${said}` : ''}`)
    }
    for await (const data of sseData(res.body as unknown as AsyncIterable<Uint8Array>)) {
      if (data === '[DONE]') break
      let chunk: {
        choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<Parameters<typeof gatherToolCall>[1]> }; finish_reason?: string | null }>
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null
        error?: { message?: string }
      }
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      if (chunk.error) throw new ProviderFailed(0, `${name} broke off: ${chunk.error.message ?? 'no reason given'}`)
      if (chunk.usage) {
        usage = { input: chunk.usage.prompt_tokens ?? usage.input, output: chunk.usage.completion_tokens ?? usage.output }
      }
      for (const choice of chunk.choices ?? []) {
        const piece = choice.delta?.content
        if (piece) {
          text += piece
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: piece } }
        }
        for (const tc of choice.delta?.tool_calls ?? []) gatherToolCall(calls, tc)
        if (choice.finish_reason) finish = choice.finish_reason
      }
    }
  }

  async function* iterate(): AsyncGenerator<TextDeltaEvent> {
    try {
      yield* run()
    } catch (e) {
      rejectFinal(e)
      throw e
    }
    const toolUses = calls
      .filter((c) => c.name)
      .map((c, i) => ({ type: 'tool_use' as const, id: c.id || `call_${i + 1}`, name: c.name, input: parseArguments(c.args) }))
    const content = [
      ...(text ? [{ type: 'text' as const, text, citations: null }] : []),
      ...toolUses,
    ]
    resolveFinal({
      id: `msg_${provider.id}`,
      type: 'message',
      role: 'assistant',
      model: provider.model,
      content,
      stop_reason: toolUses.length ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: usage.input, output_tokens: usage.output },
    } as unknown as Anthropic.Messages.Message)
  }

  let started: AsyncGenerator<TextDeltaEvent> | null = null
  return {
    [Symbol.asyncIterator]() {
      started ??= iterate()
      return started
    },
    async finalMessage() {
      // Asked before anything read it: read it here, so the answer is not lost.
      if (!started) {
        started = iterate()
        for await (const _ of started) {
          /* drained */
        }
      }
      return final
    },
  }
}
