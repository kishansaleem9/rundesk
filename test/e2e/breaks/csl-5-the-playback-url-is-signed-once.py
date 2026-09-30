# EACH CLIP'S PLAYBACK URL IS SIGNED ONCE AND KEPT (`resume-defects/resume-7`).
#
# A cache of the signed URL, the obvious saving: the first view signs, every
# later view is handed the same address. The link then dies with that first
# signature, exactly as a copied signed URL did — later than a day, earlier
# than never, and nothing on screen says so.
#
# Reddens: clip-links: "and it still plays after the signing window: the store now refuses the address it was first signed to, and opening the link again signs a new one that serves the recording"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
pairs = [
    ("const PLAYBACK_URL_SECONDS = 60 * 60\n",
     "const PLAYBACK_URL_SECONDS = 60 * 60\n/** Each clip's playback URL, signed the first time it is opened. */\nconst SIGNED_ONCE = new Map<string, string>()\n"),
    ("      url: await this.r2.getObjectUrl(row.storageKey, this.playbackSeconds),\n",
     "      url: SIGNED_ONCE.get(row.storageKey) ?? SIGNED_ONCE.set(row.storageKey, await this.r2.getObjectUrl(row.storageKey, this.playbackSeconds)).get(row.storageKey)!,\n"),
]
s = io.open(p, encoding='utf-8').read()
for a, b in pairs:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csl-5-the-playback-url-is-signed-once: a clip link plays its first signature forever')
