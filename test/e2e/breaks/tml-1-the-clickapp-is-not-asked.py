# THE CLICKAPP IS NOT ASKED.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "it is off until an owner or admin turns it on: the task’s lists say so, adding is refused in words (403) and nothing is kept, and the menu’s Add to › Another List is drawn greyed, saying why"
#   or "whoever may open one of its lists reads it there: Max, refused it before, reads it by id and in the team list after — its home still Mia’s list, which is not named to him"
#
# Re-aimed 12 October: the last 1 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
#
# Adding a task to another list works with the ClickApp off.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-lists.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!ctx.on) return TASK_LISTS_REFUSALS.off\n',
     '    // BROKEN: the ClickApp is not asked\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-1-the-clickapp-is-not-asked: THE CLICKAPP IS NOT ASKED.')
