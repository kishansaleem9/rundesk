# A BLOCKER THAT ENDS THE DAY BEFORE IS NOT ON THE PATH.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart:
#   "Customize › Critical path draws the group's last task and the tasks it waits on with no day between in red — C, B and A, not D or E — and draws none until it is asked for"
#   "and the path stays shown as it was left, the page opened again"
#   "the workspace timeline draws the same chart: the same lines between the same tasks, its time period, and the critical path as the list’s tab draws it"
#
# Only an overlap joins the path: B starts the day after A ends, so the walk stops at C.
import io
p = '/home/user/rundesk/apps/web/src/lib/gantt.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (node.start - blocker.end <= 1) walk.push(b)',
     '      if (node.start - blocker.end <= 0) walk.push(b)'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-8-a-days-gap-ends-the-path: A BLOCKER THAT ENDS THE DAY BEFORE IS NOT ON THE PATH.')
