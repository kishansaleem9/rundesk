# A TIMER STILL RUNNING COMES IN AS TIME.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "the time tracked comes in under whoever tracked it: Ana’s two billable hours are hers; Nina’s half hour waits for her; somebody ClickUp no longer has, and a timer still running, bring nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const ms = Number(r.duration)\n',
     '  const ms = Math.abs(Number(r.duration)) || 1000\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-22-running-timer-counted: A TIMER STILL RUNNING COMES IN AS TIME.')
