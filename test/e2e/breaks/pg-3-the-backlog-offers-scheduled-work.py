# The Backlog stops excluding tasks that already have a block.
#
# The suite's failure message names the consequence: "dragging it would
# double-book it." The Backlog exists to be what is NOT on the grid — that is
# what makes the drag at `[14:52]` have somewhere to start — and a list that
# offers everything assigned to you turns the grid into a place you schedule
# the same task twice, then three times.
#
# It reads as a simplification. `assigned.filter((task) =>
# !scheduledTaskIds.has(task.id))` is a filter over a Set built two hooks
# earlier from the block list, and `assigned` alone is "your work", which is
# what the panel is called.
#
# ONE CHECK, AND IT IS AN ABSENCE. "An unscheduled assigned task waits in the
# Backlog" passes — the unscheduled one is still there — and only "a task
# already on the grid is not offered again" fails. A suite that asked whether
# the backlog held the right task would pass; the scheduled one being gone is
# the claim.
#
# Reddens: planner-grid: "and a task already on the grid is not offered again"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "        ? assigned.filter((task) => !scheduledTaskIds.has(task.id)).slice(0, 25)"
b = "        ? assigned.slice(0, 25)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the Backlog offers tasks that are already scheduled.')
