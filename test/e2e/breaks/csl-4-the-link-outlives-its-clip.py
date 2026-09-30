# DELETING A CLIP LEAVES ITS LINK BEHIND (`resume-defects/resume-7`).
#
# The delete of the link row is built and never awaited, so it never runs. The
# page still says the clip is not available — its object is gone from the
# store, and the route heads it first — so a check on the page alone would
# pass; the row is still there, naming a clip that no longer exists.
#
# Reddens: clip-links: "deleting the clip ends its link: the page says it is not available, the server answers 404, and the link is gone with it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "    await this.db\n      .delete(clipLinks)\n"
b = "    void this.db\n      .delete(clipLinks)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-4-the-link-outlives-its-clip: a deleted clip keeps its link row')
