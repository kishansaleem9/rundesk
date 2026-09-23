# THE SPACE RULE WITHOUT ITS PRIVACY HALF: a private space accepts docs from
# people it keeps out.
# Reddens: doc-boundaries: "nor under a private space of its own workspace that its author is not in"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (!reachable) throw new NotFoundException('Space not found')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-4-space-ignores-privacy: applied")
