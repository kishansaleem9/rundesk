# Store the default whatever the dialog sent. The control moves, the POST
# carries `list`, the row comes back `space` — a setting that appears to have
# been accepted and was not.
# Reddens: folder-dialog: "a folder stores the scope it was created with, both ways round"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "        statusScope: data.statusScope ?? 'space',"
b = "        statusScope: 'space',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("folders.service.ts: every folder is stored 'space' — what the dialog sent is dropped on the floor.")
