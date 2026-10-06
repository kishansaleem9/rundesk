# A CLICKUP RUN THAT FAILS TAKES NOTHING AWAY: its space, project, list, tasks and tags stay.
# Reddens: imports: "a ClickUp import the database refuses at its last write ends failed and leaves nothing behind: no space, project, list, task or tag of it is there"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = '      const left = await undoRun(this.db, made)\n'
b = '      const left = await undoRun(this.db, { labelIds: [] })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('imports-71-a-failed-clickup-run-keeps-what-it-made: a failed run keeps what it made')
