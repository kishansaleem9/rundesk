# `openAssigned` stops excluding closed work, so finished tasks sit in
# "Assigned to me".
#
# A reading list of what is left to do, containing what is already done. It
# grows for ever — nothing leaves it — and the one section of the Planner whose
# job is to say "here is your work" becomes a history of everything ever
# assigned to you.
#
# It also leaks downstream: `todayOverdue` reads `openAssigned`, so a task
# finished last Tuesday and due last Monday comes back as late. The rail would
# report overdue work that was delivered on time, which is the worst kind of
# wrong for a section somebody glances at.
#
# `.filter((task) => task.statusCategory !== 'closed')` is a one-line memo over
# a list the server already scoped to this person, and it reads as a
# double-check of something the API surely did — which is exactly the reasoning
# that removes it. `list-statuses-seeded` exists because that column disagreed
# with `status` for a whole class of lists; this is the reader that trusts it.
#
# REDDENS TWO: the assigned section lists the finished task, and "Today &
# overdue" inherits it. The date-flag check still passes, because the finished
# task's date is real.
#
# Reddens: planner-rail: "and leaves out what is already finished"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = """  const openAssigned = useMemo(
    () => assigned.filter((task) => task.statusCategory !== 'closed'),
    [assigned],
  )
"""
b = """  const openAssigned = useMemo(() => assigned, [assigned])
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: finished work is now listed as assigned.')
