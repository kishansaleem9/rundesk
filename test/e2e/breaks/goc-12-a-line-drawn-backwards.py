# A LINE DRAWN FROM A BAR'S END MAKES THAT BAR WAIT.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart:
#   "a line drawn from the dot at E's end onto C makes C wait on E (read by SQL), and the line is drawn"
#   "the workspace timeline draws the same chart: the same lines between the same tasks, its time period, and the critical path as the list’s tab draws it"
#
# The two ends are read the other way round.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        const [blocker, blocked] = end === 'end' ? [taskId, other] : [other, taskId]",
     "        const [blocker, blocked] = end === 'end' ? [other, taskId] : [taskId, other]"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("goc-12-a-line-drawn-backwards: A LINE DRAWN FROM A BAR'S END MAKES THAT BAR WAIT.")
