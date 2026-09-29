# A file does not go where its task goes, as it did not: archived or put in the
# Trash, the task is withheld and its file is still found
# (found-29-sep/files-of-binned-tasks-found). Both engines' rule is taken out,
# so it reddens whichever answers.
#
# Reddens: search-index: "a file goes where its task goes — found before, and not found once its task is archived or in the Trash, whichever engine answers"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    # The database's file search.
    ("      // task and still found its file (`found-29-sep/files-of-binned-tasks-found`).\n      includeArchived ? undefined : eq(tasks.isArchived, false),\n",
     "      // task and still found its file (`found-29-sep/files-of-binned-tasks-found`).\n"),
    # The index's file hits.
    ("        includeArchived ? undefined : eq(tasks.isArchived, false),\n        taskInReachFilter(this.db, workspaceId, userId, isManager),\n",
     "        taskInReachFilter(this.db, workspaceId, userId, isManager),\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('search.service.ts: a binned task keeps its file findable, on either engine.')
