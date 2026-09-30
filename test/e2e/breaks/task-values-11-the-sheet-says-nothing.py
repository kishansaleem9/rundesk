# THE TASK SHEET SAYS NOTHING OF A REFUSED CHANGE (`found-30-sep/a-task-starts-after-it-is-due`):
# its patch has no toast on error, so a start typed after the due date is refused and nothing
# on screen says why.
#
# Reddens: task-values: "in the task sheet, a start date typed after the due date is refused and said — the toast gives the reason — and the task keeps its start (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      api(`/tasks/${taskId}`, { method: 'PATCH', body: patch }),\n    onSuccess: async () => {\n      await qc.invalidateQueries({ queryKey: ['task', taskId] })\n    },\n    onError: (err) => {\n      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask'))\n    },\n",
     "      api(`/tasks/${taskId}`, { method: 'PATCH', body: patch }),\n    onSuccess: async () => {\n      await qc.invalidateQueries({ queryKey: ['task', taskId] })\n    },\n    onError: () => undefined,\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-11-the-sheet-says-nothing: the sheet swallows a refused change')
