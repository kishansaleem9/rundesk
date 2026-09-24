import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Header, StreamableFile, type ExecutionContext } from '@nestjs/common'
import { lastValueFrom, of } from 'rxjs'
import { ResponseInterceptor } from './response.interceptor'

/** A route handler carrying the headers `@Header(...)` would have declared on it. */
const route = (...headers: Array<[string, string]>) => {
  const handler = function handler() {}
  for (const [name, value] of headers) Header(name, value)({}, 'handler', { value: handler })
  return handler
}

/** What the envelope makes of `body`, returned by `handler`. */
const through = (handler: object, body: unknown) =>
  lastValueFrom(
    new ResponseInterceptor().intercept({ getHandler: () => handler } as unknown as ExecutionContext, {
      handle: () => of(body),
    }),
  )

describe('ResponseInterceptor — data is wrapped, a file is sent as the file', () => {
  it('wraps what a route returns as { data, meta, error }', async () => {
    assert.deepEqual(await through(route(), { rows: [1] }), { data: { rows: [1] }, meta: undefined, error: null })
  })

  it('still wraps a route that declared a JSON content type, or only some other header', async () => {
    const json = route(['Content-Type', 'application/json; charset=utf-8'])
    assert.deepEqual(await through(json, { a: 1 }), { data: { a: 1 }, meta: undefined, error: null })
    const cached = route(['Cache-Control', 'no-store'])
    assert.deepEqual(await through(cached, 'ok'), { data: 'ok', meta: undefined, error: null })
  })

  it('sends a StreamableFile as it is', async () => {
    const file = new StreamableFile(Buffer.from('%PDF-1.4'), { type: 'application/pdf' })
    assert.equal(await through(route(), file), file)
  })

  it('sends what a route declared text/csv as it is, whatever the case of the header name', async () => {
    const csv = route(['Content-Type', 'text/csv; charset=utf-8'], ['Content-Disposition', 'attachment'])
    assert.equal(await through(csv, 'group,tasks-count'), 'group,tasks-count')
    assert.equal(await through(route(['content-type', 'text/calendar']), 'BEGIN:VCALENDAR'), 'BEGIN:VCALENDAR')
  })

  it('passes a body that is already an envelope through untouched', async () => {
    const shaped = { data: [1], meta: { total: 1 }, error: null }
    assert.equal(await through(route(), shaped), shaped)
  })
})
