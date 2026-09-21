# The doc-side backlink returns nothing at all — the state this row was opened
# over, where `task_doc_links` was read in exactly one direction and a doc knew
# nothing about the tasks pointing at it.
#
# Half a relationship is not a relationship: linking from the task then opening
# the doc showed no sign it had happened, and no error said why.
#
# Reddens: doc-task-links: "and now the DOC shows the task"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "      .where(visible ? and(eq(taskDocLinks.docId, docId), visible) : eq(taskDocLinks.docId, docId))\n"
b = "      .where(sql`false`)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("docs.service.ts: a doc reports no linked tasks at all.")
