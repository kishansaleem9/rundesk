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
# IT REDDENED TWO AND STOPPED THE RUN AT 6 OF 10 ON ITS FIRST GO, AND THAT WAS
# THE SUITE'S FAULT. The server poll for "is it there by id" waits fifteen
# seconds before giving up; a toast lives about four. The suite's own comment
# warned about exactly this and had only half-applied it — the toast's TEXT was
# read before the poll and the toast's CLICK was left after it. So the click
# landed on a toast that had expired, and three checks that have nothing to do
# with this patch died with it.
#
# The click now happens first. The server poll does not need the page, and the
# rail read below needs the navigation the click performs, so the reorder costs
# nothing and this patch reddens the one check it is about.
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
