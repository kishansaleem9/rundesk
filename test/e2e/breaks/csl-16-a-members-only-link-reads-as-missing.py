# A MEMBERS-ONLY LINK OPENED SIGNED OUT SAYS THE CLIP IS NOT AVAILABLE (`resume-defects/resume-7`).
#
# The page listens for the wrong refusal (403 where the server says 401), so
# "sign in to watch" is never offered: the person who could get in by signing
# in is told the clip is gone.
#
# Reddens: clip-links: "and somebody signed out who opens it is asked to sign in, and shown nothing of the clip"
import io
p = '/home/user/rundesk/apps/web/src/pages/clip-link-page.tsx'
a = "    const signIn = view.error instanceof ApiError && view.error.status === 401\n"
b = "    const signIn = view.error instanceof ApiError && view.error.status === 403\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-16-a-members-only-link-reads-as-missing: no sign-in is offered')
