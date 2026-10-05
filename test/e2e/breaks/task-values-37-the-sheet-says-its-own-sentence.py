# THE TASK SHEET SAYS ITS OWN SENTENCE FOR A REFUSED CHANGE, not the server's: "could not update" in place
# of why.
#
# Reddens: task-values: "the task sheet says a refused change in the server’s words: a start typed on a task put in the bin meanwhile is refused (409), the toast carries the server’s sentence, and the task keeps its start (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    onError: (err) => {\n      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask'))\n    },\n",
     "    onError: (err) => {\n      toast.error(err instanceof ApiError ? t('taskDetail.couldNotUpdateTask') : t('taskDetail.couldNotUpdateTask'))\n    },\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("task-values-37-the-sheet-says-its-own-sentence: the sheet says its own sentence, not the server's")
