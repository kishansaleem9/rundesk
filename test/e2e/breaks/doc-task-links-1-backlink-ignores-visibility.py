# The doc-side backlink stops filtering by task visibility, so a doc lists every
# task linked to it — including private ones the reader was never allowed to
# open.
#
# The titles are the leak. Doc access is workspace membership, so anybody in the
# workspace can open the doc; the list beside it then names tasks they cannot
# read. Nothing errors, the doc renders, and the rows look like any other.
#
# The method's own comment says this is the reason the filter exists: "a doc
# that lists it would be a way to read titles somebody is not allowed to see."
#
# Reddens: doc-task-links: "and NOT the private one they were never allowed to read"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "      .where(visible ? and(eq(taskDocLinks.docId, docId), visible) : eq(taskDocLinks.docId, docId))\n"
b = "      .where(eq(taskDocLinks.docId, docId))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("docs.service.ts: a doc's linked-task list no longer filters by task visibility.")
