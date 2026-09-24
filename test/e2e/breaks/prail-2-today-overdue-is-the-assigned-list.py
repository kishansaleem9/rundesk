# "Today & overdue" stops filtering by due date and shows the whole assigned
# list.
#
# The suite calls the check this reddens "THE DISCRIMINATING ONE" and says why:
# "A section that just re-drew the assigned list would pass the check above and
# be wrong: what makes it 'Today & overdue' is what it LEAVES OUT."
#
# Under this patch the section holds the late task and today's task — so the
# check above it passes — and also next week's, and everything with no due date
# at all. A heading that promises urgency over a list that is not urgent is
# worse than no section: it is the one part of the Planner somebody is supposed
# to be able to trust at a glance.
#
# The two rules are deliberately separate expressions and the comment above
# them explains that collapsing them "would silently change one of the two
# surfaces." This patch is the other way round — it collapses the rail's rule
# into nothing at all, which is what a "simplify this memo" change does when
# the filter looks like a re-statement of the list it reads.
#
# ONE CHECK, THE ONE THAT LEAVES SOMETHING OUT. The late/due-today flags still
# read correctly for the rows that have dates, so the check under it passes —
# and rows with no due date get `data-late="false"` from an invalid date
# comparison, which is exactly the kind of quiet wrongness this section's own
# comment is about.
#
# RE-AIMED 24 September: the section reads `assigned` itself now. The page's
# own open-work filter (`openAssigned`) restated the server's and is gone.
#
# Reddens: planner-rail: "and leaves out work that is not due yet"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = """    return assigned
      .filter((task) => {
        if (!task.dueDate) return false
        const due = new Date(task.dueDate).getTime()
        return Number.isFinite(due) && due < endOfToday
      })
      .slice(0, 25)
"""
b = """    return assigned.slice(0, 25)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: Today & overdue now holds the whole assigned list.')
