# THE DOC DOOR AS IT WAS: workspace membership, and nothing about where the doc lives.
# Reddens: workspace-read-access: "a member cannot open a doc of a space they are refused, nor the page under it (404) — while they open an open doc, and a doc and page shared with them; the admin opens all five"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (!(await canReadDoc(this.db, row, userId, isManagerRole(membership.role as string)))) {\n      throw new NotFoundException('Doc not found')\n    }\n    return row\n"
b = '    return row\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-41-doc-door-membership-only: applied")
