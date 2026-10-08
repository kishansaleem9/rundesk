# A DOC ITS CALLER MAY NOT OPEN IS "NOT FOUND" AGAIN (`found-6-oct/doc-refusals-answer-not-found`):
# to somebody of another workspace, to a guest it is not shared with, and to a
# member a private space refuses, as to an id naming nothing.
# Reddens: refused-as-forbidden: "a doc its caller may not open is refused 403 in the read’s words — read or changed by a member refused its space, a guest’s, a stranger’s — and is not changed (SQL); an id naming nothing is 404, and the open doc and the admin’s are read"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (!membership) throw new ForbiddenException(READ_REFUSALS.notMember)\n",
     "    if (!membership) throw new NotFoundException('Doc not found')\n"),
    ("      throw new ForbiddenException(membership.role === 'guest' ? READ_REFUSALS.notShared : READ_REFUSALS.privateContainer)\n",
     "      throw new NotFoundException('Doc not found')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('raf-15-doc-refusals-answer-not-found: a refused doc is 404 again')
