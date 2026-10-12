# SLACK RUNS TO THE GROUP'S END, PAST THE TASK WAITING.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "Slack time draws beside each task off the path the days it may slip: two for D, before E needs it, five for E, before the group ends — and none on the path"
#
# D is given the days to the end of the group, as if nothing waited on it.
import io
p = '/home/user/rundesk/apps/web/src/lib/gantt.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      waiting.length > 0 ? Math.min(...waiting.map((w) => byId.get(w)!.start - 1)) : groupEnd.get(n.group)!',
     '      groupEnd.get(n.group)!'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("goc-11-slack-to-the-group-end: SLACK RUNS TO THE GROUP'S END, PAST THE TASK WAITING.")
