# The same shape for "Show empty fields": the switch works end to end and
# the card simply never draws an unfilled field.
# Reddens: "a task with nothing set still draws its three fields",
#          "the card shrinks by them".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        const shown = fields.filter((f) => f.filled || showEmptyFields)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '        const shown = fields.filter((f) => f.filled)'))
print('[break 2] Show empty fields is stored, saved and read by nothing.')
