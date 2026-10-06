import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getDb, readTimestamptzText, TIMESTAMPTZ_OID } from '@rundesk/db'

/**
 * A DATE IS READ BACK AS IT IS STORED (`found-5-oct/years-below-100-read-back-wrong`).
 *
 * drizzle reads every timestamp column with `new Date(<Postgres's text>)`, and
 * V8 reads that text's two-digit-looking years as 19xx or 20xx: a start written
 * as `0002-10-06T09:00Z`, held by Postgres as `0002-10-06 09:00:00+00`, was
 * answered as `2006-02-10T09:00Z` by every route. These are the readings drizzle
 * makes of what the driver now hands it.
 */
const asDrizzleReadsIt = (pgText: string) => new Date(readTimestamptzText(pgText)).toISOString()

describe('a timestamp with time zone, read back as stored', () => {
  it('reads a year below 100 as that year, not as 19xx or 20xx', () => {
    assert.equal(asDrizzleReadsIt('0002-10-06 09:00:00+00'), '0002-10-06T09:00:00.000Z')
    assert.equal(asDrizzleReadsIt('0099-10-06 09:00:00+00'), '0099-10-06T09:00:00.000Z')
    assert.equal(asDrizzleReadsIt('0000-01-01 00:00:00+00'), '0000-01-01T00:00:00.000Z')
    assert.equal(asDrizzleReadsIt('0049-12-31 23:59:59.999+00'), '0049-12-31T23:59:59.999Z')
  })

  it('passes what this app writes today through unchanged, and reads every other form Postgres prints as the instant it is', () => {
    // Unchanged, so a raw query's rows read as they always did.
    for (const text of ['2026-10-06 09:00:00+00', '2026-10-06 09:00:00.123456+00', '0100-01-01 00:00:00+00', '9999-12-31 23:59:59+00', '2026-10-06 14:00:00+05', '2026-10-06 02:30:00-07:00']) {
      assert.equal(readTimestamptzText(text), text)
    }
    assert.equal(asDrizzleReadsIt('2026-10-06 14:00:00+05'), '2026-10-06T09:00:00.000Z')
    // A session in Los Angeles prints year 2 in its local mean time, -07:52:58.
    assert.equal(asDrizzleReadsIt('0002-10-06 01:07:02-07:52:58'), '0002-10-06T09:00:00.000Z')
    assert.equal(asDrizzleReadsIt('10000-01-01 00:00:00+00'), '+010000-01-01T00:00:00.000Z')
    // 1 BC is year 0 (ISO 8601); 2 BC is -1.
    assert.equal(asDrizzleReadsIt('0001-12-31 00:00:00+00 BC'), '0000-12-31T00:00:00.000Z')
    assert.equal(asDrizzleReadsIt('0002-06-01 12:00:00+00 BC'), '-000001-06-01T12:00:00.000Z')
    // Text it does not recognise is left as it was, and so is a year past what a
    // JavaScript date holds — rather than a throw that fails the whole query.
    assert.equal(readTimestamptzText('infinity'), 'infinity')
    assert.equal(readTimestamptzText('Tue Oct 06 09:00:00 2026 UTC'), 'Tue Oct 06 09:00:00 2026 UTC')
    assert.equal(readTimestamptzText('280000-01-01 00:00:00+00'), '280000-01-01 00:00:00+00')
  })

  it('is the parser every Db handle gives the driver for a timestamp with time zone', () => {
    // No query runs: postgres.js connects on the first one.
    const db = getDb('postgres://nobody:nothing@127.0.0.1:1/timestamp_text_unit') as unknown as {
      $client: { options: { parsers: Record<number, (text: string) => unknown> } }
    }
    const parse = db.$client.options.parsers[TIMESTAMPTZ_OID]
    assert.equal(parse('0002-10-06 09:00:00+00'), '0002-10-06T09:00:00.000Z')
    assert.equal(parse('2026-10-06 09:00:00+00'), '2026-10-06 09:00:00+00')
  })
})
