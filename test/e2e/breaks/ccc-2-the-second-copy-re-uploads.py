# The remembered clip key goes, so every action uploads the clip again.
#
# `clipKey ?? (await publishClip(…))` becomes an unconditional publish. Copy
# link, then Copy link again, and the clip is presigned and PUT twice — a
# recording of any length sent up the wire once per press, with a new key each
# time, so the two links point at two identical objects in storage.
#
# Nothing looks wrong. Both copies produce a working link, which is what makes
# this the kind of defect that ships: the only symptom is bandwidth and storage,
# and the only local evidence is a counter in a stubbed PUT.
#
# The `??` reads as a cache, and a cache is the first thing anybody removes
# while debugging "why is my link stale".
#
# ONE CHECK, and it is the one written for it: "and a second Copy link re-signs
# rather than uploading again". The first copy is correct — one presign, one
# PUT, a shared URL on the clipboard — so every check before it stays green.
#
# Reddens: clip-created-card: "and a second Copy link re-signs rather than uploading again"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = """      const key = clipKey ?? (await publishClip({
"""
b = """      const key = (await publishClip({
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: every action re-uploads the clip.')
