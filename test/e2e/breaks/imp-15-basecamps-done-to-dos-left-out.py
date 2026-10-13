# A BASECAMP LIST'S DONE TO-DOS ARE LEFT OUT: only the open ones are asked for.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "signed in, the page lists the account’s projects; importing one into a new Space brings its two lists, twenty to-dos (one done), two comments and a status from its group"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/basecamp-import/basecamp-api.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const done = await this.all<BcTodo>(`${todosUrl}${todosUrl.includes('?') ? '&' : '?'}completed=true`)\n",
     '    const done: BcTodo[] = []\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-15-basecamps-done-to-dos-left-out: the done to-dos are never asked for')
