# THE LINK IS WRITTEN FOR ANOTHER KEY THAN THE CLIP'S (`resume-defects/resume-7`).
#
# A suffix on the stored key — the kind of thing a "make it unique" edit adds —
# and the row no longer names the clip: the next Copy link does not find it
# and makes another, and opening either finds no object behind it.
#
# Reddens: clip-links: "and the link is the server’s, for the clip the card uploaded: one row, naming that clip in this workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "        .values({ workspaceId, storageKey: key, token, createdById: actorId })\n"
b = "        .values({ workspaceId, storageKey: `${key}.link`, token, createdById: actorId })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-22-the-link-names-another-key: the link row names a key that is not the clip')
