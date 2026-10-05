# THE TASK SHEET SAYS NOTHING WHEN THE SERVER REFUSES A CHANGE: its PATCH's refusal goes nowhere, and the
# box shows the typed value as if it had been kept.
#
# Reddens: task-values: "the task sheet says a refused change in the server’s words: a start typed on a task put in the bin meanwhile is refused (409), the toast carries the server’s sentence, and the task keeps its start (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    onError: (err) => {\n      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask'))\n    },\n",
     "    onError: (err) => {\n      void err\n    },\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-36-the-sheet-says-nothing-of-a-refusal: the sheet says nothing of a refused change')
