# THE PLANNER’S SETTINGS NEVER SAY THE CHOSEN DEFAULT LIST IS IN THE TRASH.
# Reddens: unit: planner-default-list-trash.test.ts "says so when the list is this workspace’s and the create gate refuses it for being in the trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '      if (err instanceof ListInTrashException) return true\n'
b = '      if (err instanceof ListInTrashException) return false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptl-1-the-settings-never-say-the-trash-unit: the settings never say the trash')
