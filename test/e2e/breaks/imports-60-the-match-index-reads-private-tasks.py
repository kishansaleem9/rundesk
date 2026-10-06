# THE MATCH INDEX SKIPS THE PRIVATE-TASK RULE (`found-6-oct/import-previews-tell-what-private-places-hold`, `found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`): a private task
# the member may not open is counted by both previews, and a merge naming it matches it, to be refused as not found.
# Reddens: imports:
#   "for a member granted workspace.import, both previews count as a duplicate only the task they may open — not a private space’s task, a private list’s or a private task"
#   "a merge by a member granted workspace.import matches no task they may not open — both importers, with a space named and without: a private list’s task, a private space’s and a private task stay as they were, and each row is imported as a new task, with no refusal to say the other is there"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = '        taskVisibilityFilter(db, importer.id, isManager),\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-60-the-match-index-reads-private-tasks: the match index skips the private-task rule')
