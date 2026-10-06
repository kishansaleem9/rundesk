# A CLICKUP RUN THAT FAILS TAKES NOTHING AWAY.
# Reddens: unit: clickup-import.service.test.ts "a run whose last write is refused takes away what it made — its project, its space and the tags it made — and its job is marked failed, having created nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = '      const left = await undoRun(this.db, made)\n'
b = '      const left = await undoRun(this.db, { labelIds: [] })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ics-14-a-failed-clickup-run-keeps-what-it-made-unit: a failed run keeps what it made')
