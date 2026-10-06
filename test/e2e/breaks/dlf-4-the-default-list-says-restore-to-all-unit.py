# A DELETED DEFAULT LIST TELLS EVERYBODY TO RESTORE IT, as it did.
# Reddens: unit: default-list.test.ts "tells somebody the Trash will not let restore it to ask an admin, or whoever deleted it, not to restore it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '              err.mayRestore\n'
b = '              true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dlf-4-the-default-list-says-restore-to-all-unit: everybody is told to restore it')
