# The remembered clip key goes, so every action uploads the clip again.
#
# `if (clipKey) return clipKey` goes (it was `clipKey ?? (await publishClip(…))`
# until Create a task started reusing the key too), so every action publishes. Copy
# link, then Copy link again, and the clip is presigned and PUT twice — a
# recording of any length sent up the wire once per press, with a new key each
# time, so the two links point at two identical objects in storage.
#
# Nothing looks wrong. Both copies produce a working link, which is what makes
# this the kind of defect that ships: the only symptom is bandwidth and storage,
# and the only local evidence is a counter in a stubbed PUT.
#
# The early return reads as a cache, and a cache is the first thing anybody
# removes while debugging "why is my link stale".
#
# TWO CHECKS, the one written for it first. The first copy is correct — one
# presign, one PUT, a shared URL on the clipboard — so every check before it
# stays green. The second is the failed-attach check further down: with no key
# remembered, Create a task uploads the clip afresh, so deleting the first
# upload no longer makes its attach fail (measured on lane 4, 29 September:
# 24/26). RE-AIMED for `resume-defects/resume-7`: the check read "re-signs
# rather than uploading again"; a second Copy link now asks for the clip's own
# link, which nothing signs until it is opened, and the sentence says so.
#
# Reddens: clip-created-card: "and a second Copy link asks for the same link rather than uploading again"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = """    if (clipKey) return clipKey
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: every action re-uploads the clip.')
