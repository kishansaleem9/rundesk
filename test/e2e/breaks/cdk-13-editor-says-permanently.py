# THE ROLE EDITOR SAYS DELETE LISTS DELETES THEM PERMANENTLY, AS IT DID: the route sends a list to the Trash.
# Reddens: container-delete-keys: "the role editor offers Delete spaces, Delete projects and Delete lists, each described as sending what somebody else made to the Trash, and no longer offers Delete any task, Delete any doc or Publish docs externally"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
s = io.open(p, encoding='utf-8').read()
a = "  'rolesTab.permDesc.listDelete': 'Move a list someone else made to the Trash, where you have Full edit',\n"
b = "  'rolesTab.permDesc.listDelete': 'Permanently delete lists',\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-13-editor-says-permanently: Delete lists is described as permanent')
