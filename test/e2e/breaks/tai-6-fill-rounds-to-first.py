# THE CONFIDENT FALLBACK. A classification that failed -- refused, rate
# limited, unresolvable -- quietly applies the FIRST task type instead, so a
# guess and a decision look identical on the task. This is the reasoning that
# kept Assign with AI out of the product.
# Reddens: task-ai-bar -- 'a refused classification changes the task type to NOTHING'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    onError: (e) => toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t('taskTypes.failed')),"""
b = """    onError: (e) => {
      void api(`/tasks/${taskId}/task-type`, { method: 'PATCH', body: { taskTypeId: types[0]?.id ?? null } })
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t('taskTypes.failed'))
    },"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: a failed Fill with AI now falls back to the first task type.")
