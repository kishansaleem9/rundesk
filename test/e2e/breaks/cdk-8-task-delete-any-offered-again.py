# THE CATALOG OFFERS task.delete.any AGAIN, A MANAGER'S BY DEFAULT, AS IT DID: a key nothing asks.
# Reddens: container-delete-keys: "the catalog offers space.delete, project.delete and list.delete, and no longer task.delete.any, doc.delete.any or doc.publish, which gate nothing — a role naming one of those is refused (400) and none is made"
#   or "a role saved while the retired keys were offered is assigned as before, and grants list.delete and nothing for task.delete.any, doc.delete.any or doc.publish"
#   or "the role editor offers Delete spaces, Delete projects and Delete lists, each described as sending what somebody else made to the Trash, and no longer offers Delete any task, Delete any doc or Publish docs externally"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/permission-catalog.ts'
s = io.open(p, encoding='utf-8').read()
a = "  | 'list.delete'\n  // Automation\n"
b = "  | 'list.delete'\n  | 'task.delete.any'\n  // Automation\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "  { key: 'list.delete',      label: 'Delete lists',              description: 'Move a list someone else made to the Trash, where you have Full edit', category: 'Content' },\n"
b = "  { key: 'list.delete',      label: 'Delete lists',              description: 'Move a list someone else made to the Trash, where you have Full edit', category: 'Content' },\n  { key: 'task.delete.any',  label: 'Delete any task',           description: 'Delete tasks created by anyone (not just your own)', category: 'Content' },\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "  'list.delete',\n  'template.manage',\n"
b = "  'list.delete',\n  'task.delete.any',\n  'template.manage',\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-8-task-delete-any-offered-again: task.delete.any is in the catalog and the manager defaults')
