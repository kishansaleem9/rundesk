# TIME ASKS THE EDIT RULE: a timer and a manual entry are refused to whoever may only read the task.
# Reddens: time-tracking-readers: "a guest starts, stops and logs time on a task shared with them at View — not on one that is not (403, none made) — and a member of a view-only space does as the guest does"
#   or "the sheet offers the guest Start timer on a task shared with them at View, and the timer runs"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    // If there's an already-running timer for this user, stop it first.\n",
     "    await this.assertTaskWriteAccess(taskId, userId)\n    // If there's an already-running timer for this user, stop it first.\n"),
    ("    const durationSec = Math.max(0, Math.floor((data.endedAt.getTime() - data.startedAt.getTime()) / 1000))\n",
     "    await this.assertTaskWriteAccess(data.taskId, data.userId)\n    const durationSec = Math.max(0, Math.floor((data.endedAt.getTime() - data.startedAt.getTime()) / 1000))\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ttr-1-time-asks-edit: a timer and a manual entry ask the edit rule')
