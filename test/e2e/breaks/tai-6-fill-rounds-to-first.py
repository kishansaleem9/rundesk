# THE CONFIDENT FALLBACK. A classification that failed -- refused, rate
# limited, unresolvable -- quietly applies the FIRST task type instead, so a
# guess and a decision look identical on the task. This is the reasoning that
# kept Assign with AI out of the product.
# IT RAN GREEN ON A RACE OF ITS OWN MAKING. The fallback it adds is
# `void api(...)` inside `onError` — unawaited — so the write lands a moment
# after the refusal reaches the screen, and the check read the task's type ONCE,
# immediately, and saw the old value. The patch modelled the defect correctly
# and the check could not see it for three hundred milliseconds' worth of
# reason.
#
# `task-ai-bar` polls for three seconds now and breaks the moment the type
# changes, so an unawaited write has somewhere to land and a type that never
# changes still leaves the loop with the value the check wants.
#
# AND IT RAN GREEN AGAIN AFTER THAT, for a reason that had nothing to do with
# timing. Every workspace seeds Task · Milestone · Form Response · Meeting Note
# in that order and a freshly created task ALREADY CARRIES `Task` — so the
# fallback wrote the value the task already had, before and after were
# identical, and the check passed on a product that had just rounded a guess
# to a decision. The suite stands the task on Milestone first now, and asserts
# that it took, because a precondition nobody checks is how this hid twice.
#
# PREDICTED ONE.
#
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
