import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type Track = {
  id: string
  title: string
  items: string[]
}

type Checklist = {
  version: string
  owner: string
  tracks: Track[]
}

const CHECKLIST_PATH = path.resolve(process.cwd(), '../../config/parity-checklist.json')

function isKebabCase(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

test('parity checklist has valid structure', async () => {
  const raw = await readFile(CHECKLIST_PATH, 'utf8')
  const checklist = JSON.parse(raw) as Checklist

  assert.ok(checklist.version, 'version is required')
  assert.ok(checklist.owner, 'owner is required')
  assert.ok(Array.isArray(checklist.tracks), 'tracks must be an array')
  assert.ok(checklist.tracks.length >= 10, 'at least 10 tracks are required')

  const seenTrackIds = new Set<string>()
  const seenItems = new Set<string>()

  for (const track of checklist.tracks) {
    assert.ok(track.title.length > 0, `track ${track.id} must have title`)
    assert.ok(isKebabCase(track.id), `track id must be kebab-case: ${track.id}`)
    assert.ok(!seenTrackIds.has(track.id), `duplicate track id: ${track.id}`)
    seenTrackIds.add(track.id)

    assert.ok(Array.isArray(track.items), `track ${track.id} items must be array`)
    assert.ok(track.items.length >= 4, `track ${track.id} must have at least 4 items`)

    for (const item of track.items) {
      assert.ok(isKebabCase(item), `item id must be kebab-case: ${item}`)
      const namespaced = `${track.id}:${item}`
      assert.ok(!seenItems.has(namespaced), `duplicate item id in track ${track.id}: ${item}`)
      seenItems.add(namespaced)
    }
  }
})
