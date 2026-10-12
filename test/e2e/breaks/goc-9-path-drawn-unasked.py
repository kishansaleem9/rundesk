# THE CRITICAL PATH IS DRAWN BEFORE IT IS ASKED FOR.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart:
#   "Customize › Critical path draws the group's last task and the tasks it waits on with no day between in red — C, B and A, not D or E — and draws none until it is asked for"
#   "the workspace timeline draws the same chart: the same lines between the same tasks, its time period, and the critical path as the list’s tab draws it"
#
# The path is on for every new viewer, and the switch turns it off.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const [showCritical, setShowCritical] = useState<boolean>(() => readFlag(LS_CRITICAL_PATH))',
     '  const [showCritical, setShowCritical] = useState<boolean>(() => true)'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-9-path-drawn-unasked: THE CRITICAL PATH IS DRAWN BEFORE IT IS ASKED FOR.')
