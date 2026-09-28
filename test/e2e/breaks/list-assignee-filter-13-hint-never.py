# The "these need a person" hint is dropped, so with Anyone selected the
# three switches visibly move and the grid never changes, with nothing on
# screen saying why.
# Reddens: "and says out loud that they need a person before they do anything".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          {!assignedViaOn && ('
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '          {false && ('))
print('[break 13] The three switches give no sign that they extend nothing.')
