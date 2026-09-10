import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLIP_QUALITIES,
  DEFAULT_CLIP_SETUP,
  displayConstraints,
  micConstraints,
  listMicrophones,
  readClipSetup,
  writeClipSetup,
} from './clip-capture.ts'

/** A localStorage that behaves, for the round-trip tests. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

const setWindow = (value: unknown) => {
  ;(globalThis as unknown as { window: unknown }).window = value
}
const setNavigator = (value: unknown) => {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
}

describe('displayConstraints', () => {
  it('turns the chosen quality into a height', () => {
    const c = displayConstraints({ ...DEFAULT_CLIP_SETUP, quality: '720p' })
    assert.deepEqual((c.video as MediaTrackConstraints).height, { ideal: 720 })
  })

  it('and a 16:9 width beside it, so a label means a size', () => {
    const c = displayConstraints({ ...DEFAULT_CLIP_SETUP, quality: '1080p' })
    assert.deepEqual((c.video as MediaTrackConstraints).width, { ideal: 1920 })
  })

  it('asks with `ideal`, never `exact`', () => {
    // `exact` would turn a quality preference into a reason the recording
    // refuses to start on a screen that cannot source it.
    const video = displayConstraints(DEFAULT_CLIP_SETUP).video as Record<string, unknown>
    assert.equal('exact' in (video.height as object), false)
    assert.equal('exact' in (video.width as object), false)
  })

  it('passes the surface hint through', () => {
    const video = displayConstraints({ ...DEFAULT_CLIP_SETUP, surface: 'window' })
      .video as Record<string, unknown>
    assert.equal(video.displaySurface, 'window')
  })

  it('falls back to 1080p for a quality that is not offered', () => {
    const c = displayConstraints({ ...DEFAULT_CLIP_SETUP, quality: '4k' as never })
    assert.deepEqual((c.video as MediaTrackConstraints).height, { ideal: 1080 })
  })
})

describe('micConstraints', () => {
  it('is null when no microphone is wanted — a silent capture is a choice', () => {
    assert.equal(micConstraints({ ...DEFAULT_CLIP_SETUP, micId: '' }), null)
  })

  it('asks for the system default without naming a device', () => {
    const c = micConstraints({ ...DEFAULT_CLIP_SETUP, micId: 'default' })
    assert.equal(c?.audio, true)
  })

  it('and pins an exact device when one was picked', () => {
    // `exact` IS right here, unlike the video height: asking for a particular
    // microphone and silently getting a different one is worse than failing.
    const c = micConstraints({ ...DEFAULT_CLIP_SETUP, micId: 'headset-1' })
    assert.deepEqual(c?.audio, { deviceId: { exact: 'headset-1' } })
  })
})

describe('listMicrophones', () => {
  it('returns nothing rather than throwing where the API is absent', async () => {
    setNavigator({})
    assert.deepEqual(await listMicrophones(), [])
  })

  it('keeps only audio inputs', async () => {
    setNavigator({
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'a', label: 'Internal Microphone' },
          { kind: 'videoinput', deviceId: 'b', label: 'FaceTime HD' },
          { kind: 'audiooutput', deviceId: 'c', label: 'Speakers' },
        ],
      },
    })
    const mics = await listMicrophones()
    assert.deepEqual(mics, [{ deviceId: 'a', label: 'Internal Microphone' }])
  })

  it('names an unlabelled device by position instead of leaving it blank', async () => {
    // Before a permission is granted the browser returns empty labels on
    // purpose. A blank row is unpickable; "Microphone 2" is at least a name.
    setNavigator({
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'a', label: '' },
          { kind: 'audioinput', deviceId: 'b', label: '' },
        ],
      },
    })
    assert.deepEqual((await listMicrophones()).map((m) => m.label), ['Microphone 1', 'Microphone 2'])
  })

  it('survives a rejected device list', async () => {
    setNavigator({
      mediaDevices: { enumerateDevices: async () => { throw new Error('blocked') } },
    })
    assert.deepEqual(await listMicrophones(), [])
  })
})

describe('the remembered setup', () => {
  beforeEach(() => setWindow({ localStorage: fakeStorage() }))

  it('is the default before anything is stored', () => {
    assert.deepEqual(readClipSetup(), DEFAULT_CLIP_SETUP)
  })

  it('round-trips a choice', () => {
    writeClipSetup({ quality: '720p', surface: 'window', micId: 'headset-1' })
    assert.deepEqual(readClipSetup(), { quality: '720p', surface: 'window', micId: 'headset-1' })
  })

  it('rejects a stored quality that is no longer offered', () => {
    setWindow({ localStorage: fakeStorage({ 'rundesk.clipSetup': '{"quality":"4k"}' }) })
    assert.equal(readClipSetup().quality, DEFAULT_CLIP_SETUP.quality)
  })

  it('rejects a stored surface that is not a surface', () => {
    setWindow({ localStorage: fakeStorage({ 'rundesk.clipSetup': '{"surface":"hologram"}' }) })
    assert.equal(readClipSetup().surface, DEFAULT_CLIP_SETUP.surface)
  })

  it('falls back on stored nonsense rather than throwing', () => {
    setWindow({ localStorage: fakeStorage({ 'rundesk.clipSetup': 'not json' }) })
    assert.deepEqual(readClipSetup(), DEFAULT_CLIP_SETUP)
  })

  it('and where storage itself throws', () => {
    setWindow({
      localStorage: {
        getItem: () => { throw new Error('blocked') },
        setItem: () => { throw new Error('blocked') },
      },
    })
    assert.deepEqual(readClipSetup(), DEFAULT_CLIP_SETUP)
    // Writing must not throw either: the choice still applies to this recording.
    writeClipSetup(DEFAULT_CLIP_SETUP)
  })
})

describe('the quality list itself', () => {
  it('offers the frame’s own value', () => {
    assert.equal(CLIP_QUALITIES.some((q) => q.id === '1080p'), true)
  })

  it('and every entry has a height to send', () => {
    for (const q of CLIP_QUALITIES) {
      assert.equal(typeof q.height === 'number' && q.height > 0, true, `${q.id} has no height`)
    }
  })
})
