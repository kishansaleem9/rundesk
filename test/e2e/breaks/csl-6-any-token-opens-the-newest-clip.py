# THE ROUTE IGNORES THE TOKEN: ANY WELL-FORMED ONE OPENS THE NEWEST LINKED CLIP (`resume-defects/resume-7`).
#
# `resume-defects/s4-clip-link` names this break for the route it would share:
# the lookup's condition becomes an order, so the token in the address picks
# nothing, and a made-up token plays somebody's clip. An unguessable token is
# the whole of what keeps a link to its clip.
#
# Reddens: clip-links: "a link nobody was given is refused: a made-up token of the same shape shows the clip is not available, and the server signs nothing for it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
pairs = [
    ("import { and, eq } from 'drizzle-orm'\n", "import { and, desc, eq } from 'drizzle-orm'\n"),
    ("      .where(eq(clipLinks.token, token))\n", "      .orderBy(desc(clipLinks.createdAt))\n"),
]
s = io.open(p, encoding='utf-8').read()
for a, b in pairs:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csl-6-any-token-opens-the-newest-clip: the token no longer chooses the clip')
