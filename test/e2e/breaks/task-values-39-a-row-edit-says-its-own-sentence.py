# A ROW EDIT ON THE LIST PAGE SAYS ITS OWN SENTENCE FOR A REFUSAL (`patchTaskSaying`), not the server's:
# "could not update" in place of why.
#
# Reddens: task-values: "a row edit on the list page says a refused change in the server’s words: a priority picked in the Table view on a task put in the bin meanwhile is refused (409), the toast carries the server’s sentence, and the task keeps its priority (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask'))\n    }\n    await refetch()\n",
     "      toast.error(err instanceof ApiError ? t('taskDetail.couldNotUpdateTask') : t('taskDetail.couldNotUpdateTask'))\n    }\n    await refetch()\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("task-values-39-a-row-edit-says-its-own-sentence: a refused row edit says its own sentence, not the server's")
