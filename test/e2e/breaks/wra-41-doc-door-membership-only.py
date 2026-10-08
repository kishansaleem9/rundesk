# THE DOC DOOR AS IT WAS: workspace membership, and nothing about where the doc lives.
# Re-aimed 8 October: the doc door refuses in the read's words (`found-6-oct/doc-refusals-answer-not-found`).
# Reddens: workspace-read-access: "a member cannot open a doc of a space they are refused, nor the page under it (403 “This space or project is private”) — while they open an open doc, and a doc and page shared with them; the admin opens all five"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    if (!(await canReadDoc(this.db, row, userId, isManagerRole(membership.role as string)))) {\n      throw new ForbiddenException(membership.role === 'guest' ? READ_REFUSALS.notShared : READ_REFUSALS.privateContainer)\n    }\n    return row\n"
b = '    return row\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-41-doc-door-membership-only: applied")
