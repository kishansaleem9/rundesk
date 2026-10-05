# A ROW EDIT ON THE LIST PAGE SAYS NOTHING WHEN THE SERVER REFUSES IT (`patchTaskSaying`, which the
# calendar drop and the Gantt shift send through too): the refusal goes nowhere, as it did before
# 30 September.
#
# Reddens: task-values: "a row edit on the list page says a refused change in the server’s words: a priority picked in the Table view on a task put in the bin meanwhile is refused (409), the toast carries the server’s sentence, and the task keeps its priority (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask'))\n    }\n    await refetch()\n",
     "      void err\n    }\n    await refetch()\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-38-a-row-edit-says-nothing-of-a-refusal: a refused row edit says nothing')
