# The prompt adds a priority with the task's TITLE instead of its id.
#
# The rail then shows the right words and points at nothing. Renaming the task
# leaves the priority reading the old name; finishing the task leaves the
# priority open; the row has no link back and the Done button ticks a note
# rather than the work. `usePriorityActions.add` takes `string | { taskId }`
# exactly so both are possible — the rail types a line, this flow passes a task
# — and passing the wrong one of the two is a one-word change with no type
# error behind it.
#
# THE CHECK IT REDDENS IS THE ONE THAT SAYS WHY. "the task is on your
# priorities, by id — not a copy of its title" fails; "and THAT task is in the
# Priorities rail" passes, because the rail is reading a title and the title is
# correct. Two checks that look like one question, and this patch is the reason
# they are two.
#
# The toast still fires, the link still lands on the Planner, the counter still
# reads 1. Everything a screenshot could show is right.
#
# Reddens: assign-to-priorities: "the task is on your priorities, by id — not a copy of its title"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    priorityActions.add.mutate(
      { taskId },"""
b = """    priorityActions.add.mutate(
      detail.title,"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the priority is stored as a copy of the title, not as the task.')
