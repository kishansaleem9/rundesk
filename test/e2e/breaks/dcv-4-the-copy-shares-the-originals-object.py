# A DUPLICATE’S FILE NAMES THE ORIGINAL’S OBJECT, so removing either task’s file takes the other’s.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: custom-field-progress: "and its Files field names the copy’s own copy of the file and none of the original’s attachments — while its other values are copied"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        storageKey = `workspaces/${ctx.workspaceId}/tasks/${toTaskId}/attachments/${Date.now()}-${i}-${safeFileName(row.fileName)}`\n'
b = "        storageKey = row.storageKey // BROKEN: the copy names the original's object\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dcv-4-the-copy-shares-the-originals-object: a copied file shares its original’s object')
