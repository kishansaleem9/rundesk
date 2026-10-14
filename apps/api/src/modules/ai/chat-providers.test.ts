import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type Anthropic from '@anthropic-ai/sdk'
import {
  ProviderFailed,
  chatProvidersFrom,
  gatherToolCall,
  streamChat,
  toChatMessages,
  toChatTools,
  type ChatProviderConfig,
} from './chat-providers'

/**
 * `commit-log/log-39863ff-1` — ChatGPT and Gemini answer a Brain turn through
 * OpenAI's Chat Completions API. What is pinned here is the translation both
 * ways — the turn as OpenAI takes it, the answer as the loop reads Claude's —
 * because a turn that loses its tool results, or a stream whose tool call comes
 * back without its arguments, looks like an answer and is not one.
 */

const OPENAI: ChatProviderConfig = { id: 'openai', base: 'http://provider.test/v1', key: 'k-open', model: 'gpt-5.4' }
const GEMINI: ChatProviderConfig = { id: 'google', base: 'http://gemini.test/v1beta/openai', key: 'k-gem', model: 'gemini-3-flash-preview' }

/** A provider answering one stream of chunks, recording what it was asked. */
function fakeProvider(chunks: unknown[], status = 200) {
  const asked: Array<{ url: string; headers: Record<string, string>; body: any }> = []
  const impl = (async (url: string, init: RequestInit) => {
    asked.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) })
    if (status !== 200) {
      return new Response(JSON.stringify({ error: { message: 'Incorrect API key provided.' } }), { status })
    }
    const sse = chunks.map((c) => `data: ${typeof c === 'string' ? c : JSON.stringify(c)}\n\n`).join('')
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }) as unknown as typeof fetch
  return { impl, asked }
}

const drain = async (stream: AsyncIterable<{ delta: { text: string } }>) => {
  let seen = ''
  for await (const e of stream) seen += e.delta.text
  return seen
}

describe('chat providers: which are set up', () => {
  it('offers ChatGPT on its own key or OpenAI’s, and Gemini on its own', () => {
    assert.deepEqual(chatProvidersFrom({}), {})
    const both = chatProvidersFrom({ OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' })
    assert.equal(both.openai?.base, 'https://api.openai.com/v1')
    assert.equal(both.openai?.model, 'gpt-5.4')
    assert.equal(both.google?.base, 'https://generativelanguage.googleapis.com/v1beta/openai')
    assert.equal(both.google?.model, 'gemini-3-flash-preview')
    const own = chatProvidersFrom({ CHATGPT_API_KEY: 'c', OPENAI_API_KEY: 'o', CHATGPT_API_URL: 'http://stub/openai/v1/', CHATGPT_MODEL: 'gpt-x' })
    assert.deepEqual(own.openai, { id: 'openai', key: 'c', base: 'http://stub/openai/v1', model: 'gpt-x' })
    assert.equal(own.google, undefined)
    // An address with no key sets nothing up.
    assert.deepEqual(chatProvidersFrom({ GEMINI_API_URL: 'http://stub', CHATGPT_MODEL: 'gpt-x' }), {})
  })
})

describe('chat providers: the turn, in OpenAI’s words', () => {
  it('says a tool loop as Chat Completions takes it: calls on the assistant, results as tool messages first', () => {
    const turn: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: 'Make a list called Launch' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Making it.' },
          { type: 'tool_use', id: 'call_9', name: 'create_list', input: { name: 'Launch' } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_9', content: '{"ok":true}' }] },
    ]
    const out = toChatMessages('SYSTEM', turn)
    assert.deepEqual(out, [
      { role: 'system', content: 'SYSTEM' },
      { role: 'user', content: 'Make a list called Launch' },
      {
        role: 'assistant',
        content: 'Making it.',
        tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'create_list', arguments: '{"name":"Launch"}' } }],
      },
      { role: 'tool', tool_call_id: 'call_9', content: '{"ok":true}' },
    ])
  })

  it('sends a picture as its bytes, and a PDF as a file to OpenAI and as bytes to Gemini', () => {
    const turn: Anthropic.Messages.MessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'UE5H' } },
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'UERG' }, title: 'brief.pdf' },
          { type: 'text', text: 'What is in these?' },
        ],
      },
    ]
    const toOpenAi = toChatMessages('S', turn, 'openai')[1] as { content: any[] }
    assert.deepEqual(toOpenAi.content, [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,UE5H' } },
      { type: 'file', file: { filename: 'brief.pdf', file_data: 'data:application/pdf;base64,UERG' } },
      { type: 'text', text: 'What is in these?' },
    ])
    const toGemini = toChatMessages('S', turn, 'google')[1] as { content: any[] }
    assert.deepEqual(toGemini.content[1], { type: 'image_url', image_url: { url: 'data:application/pdf;base64,UERG' } })
  })

  it('offers Claude’s tools as functions with the same schema', () => {
    const tools = toChatTools([{ name: 'create_list', description: 'Make a list', input_schema: { type: 'object', properties: { name: { type: 'string' } } } }])
    assert.deepEqual(tools, [
      { type: 'function', function: { name: 'create_list', description: 'Make a list', parameters: { type: 'object', properties: { name: { type: 'string' } } } } },
    ])
  })
})

describe('chat providers: the answer, as the loop reads Claude’s', () => {
  it('streams the text as it comes and ends on a message with its usage', async () => {
    const { impl, asked } = fakeProvider([
      { choices: [{ delta: { role: 'assistant', content: '' } }] },
      { choices: [{ delta: { content: 'Hello ' } }] },
      { choices: [{ delta: { content: 'there' }, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 120, completion_tokens: 7 } },
      '[DONE]',
    ])
    const stream = streamChat(OPENAI, { system: 'S', messages: [{ role: 'user', content: 'hi' }] }, impl)
    assert.equal(await drain(stream), 'Hello there')
    const final = await stream.finalMessage()
    assert.deepEqual(final.content, [{ type: 'text', text: 'Hello there', citations: null }])
    assert.deepEqual(final.usage, { input_tokens: 120, output_tokens: 7 })
    assert.equal(final.stop_reason, 'end_turn')
    assert.equal(asked[0].url, 'http://provider.test/v1/chat/completions')
    assert.equal(asked[0].headers.authorization, 'Bearer k-open')
    assert.equal(asked[0].body.model, 'gpt-5.4')
    assert.equal(asked[0].body.stream, true)
    assert.deepEqual(asked[0].body.stream_options, { include_usage: true })
    assert.ok(asked[0].body.max_completion_tokens > 2048)
  })

  it('gathers a tool call sent in pieces under its index into one tool_use with its arguments', async () => {
    const { impl } = fakeProvider([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'create_list', arguments: '' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"name":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Launch"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      '[DONE]',
    ])
    const stream = streamChat(OPENAI, { system: 'S', messages: [{ role: 'user', content: 'go' }], tools: [{ name: 'create_list', input_schema: { type: 'object' } }] }, impl)
    await drain(stream)
    const final = await stream.finalMessage()
    assert.deepEqual(final.content, [{ type: 'tool_use', id: 'call_a', name: 'create_list', input: { name: 'Launch' } }])
    assert.equal(final.stop_reason, 'tool_use')
  })

  it('takes Gemini’s whole calls with no index as calls of their own, and asks it by max_tokens', async () => {
    const { impl, asked } = fakeProvider([
      { choices: [{ delta: { tool_calls: [{ id: 'g1', type: 'function', function: { name: 'create_list', arguments: '{"name":"A"}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ id: 'g2', type: 'function', function: { name: 'create_list', arguments: '{"name":"B"}' } }] }, finish_reason: 'stop' }] },
      '[DONE]',
    ])
    const stream = streamChat(GEMINI, { system: 'S', messages: [{ role: 'user', content: 'go' }] }, impl)
    await drain(stream)
    const final = await stream.finalMessage()
    assert.deepEqual(final.content.map((b: any) => [b.id, b.input.name]), [['g1', 'A'], ['g2', 'B']])
    assert.equal(asked[0].url, 'http://gemini.test/v1beta/openai/chat/completions')
    assert.equal(asked[0].body.max_tokens > 2048, true)
    assert.equal(asked[0].body.stream_options, undefined)
  })

  it('refuses in the provider’s own words, naming it', async () => {
    const { impl } = fakeProvider([], 401)
    const stream = streamChat(OPENAI, { system: 'S', messages: [{ role: 'user', content: 'hi' }] }, impl)
    await assert.rejects(drain(stream), (e: unknown) => e instanceof ProviderFailed && e.status === 401 && /ChatGPT answered 401: Incorrect API key/.test(e.message))
  })

  it('a slot keeps the first name it was given, and a call with no id gets one', () => {
    const calls: Array<{ id: string; name: string; args: string }> = []
    gatherToolCall(calls, { index: 0, function: { name: 'create_list', arguments: '{}' } })
    gatherToolCall(calls, { index: 0, function: { name: 'create_list' } })
    assert.deepEqual(calls, [{ id: '', name: 'create_list', args: '{}' }])
  })
})
