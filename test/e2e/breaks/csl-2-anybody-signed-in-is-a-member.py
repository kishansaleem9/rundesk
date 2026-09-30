# ANYBODY SIGNED IN COUNTS AS A MEMBER OF A MEMBERS-ONLY CLIP'S WORKSPACE (`resume-defects/resume-7`).
#
# The platform-admin exception is widened to every session, so the membership
# question is never asked: where the workspace blocks public sharing, the
# stranger signed out is still asked to sign in, and anybody who then signs in,
# from any workspace, watches.
#
# Reddens: clip-links: "and somebody from another workspace, signed in, is refused as though the link were not one, and nothing is signed"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "    if (viewer.role === 'super_admin') return true\n"
b = "    if (viewer.id) return true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-2-anybody-signed-in-is-a-member: every session is let into a members-only clip')
