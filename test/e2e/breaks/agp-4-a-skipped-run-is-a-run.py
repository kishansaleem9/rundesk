# A RUN REFUSED BEFORE IT BEGAN IS COUNTED AS A RUN: switched off or not started by that, it did nothing.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "a run refused before it began is not one of its runs, and last month’s runs are not this month’s"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(c, encoding='utf-8').read()
old = "and r.status <> 'skipped' and r.started_at >= ${since}::timestamptz)`,\n"
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, 'and r.started_at >= ${since}::timestamptz)`,\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-4-a-skipped-run-is-a-run: a run refused before it began is counted as a run')
