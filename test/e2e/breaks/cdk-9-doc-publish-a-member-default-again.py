# THE CATALOG OFFERS doc.publish AGAIN, EVERY MEMBER'S BY DEFAULT, AS IT DID: a key that could only ever add a guest's publishing.
# Reddens: container-delete-keys: "a role saved while the retired keys were offered is assigned as before, and grants list.delete and nothing for task.delete.any, doc.delete.any or doc.publish"
#   or "the catalog offers space.delete, project.delete and list.delete, and no longer task.delete.any, doc.delete.any or doc.publish, which gate nothing — a role naming one of those is refused (400) and none is made"
#   or "the role editor offers Delete spaces, Delete projects and Delete lists, each described as sending what somebody else made to the Trash, and no longer offers Delete any task, Delete any doc or Publish docs externally"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/permission-catalog.ts'
s = io.open(p, encoding='utf-8').read()
a = "  | 'list.delete'\n  // Automation\n"
b = "  | 'list.delete'\n  | 'doc.publish'\n  // Automation\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "  { key: 'list.delete',      label: 'Delete lists',              description: 'Move a list someone else made to the Trash, where you have Full edit', category: 'Content' },\n"
b = "  { key: 'list.delete',      label: 'Delete lists',              description: 'Move a list someone else made to the Trash, where you have Full edit', category: 'Content' },\n  { key: 'doc.publish',      label: 'Publish docs externally',   description: 'Toggle public read-only sharing on docs', category: 'Content' },\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "const MEMBER_DELTA: readonly Permission[] = ['space.create', 'report.export', 'report.view.basic']\n"
b = "const MEMBER_DELTA: readonly Permission[] = ['space.create', 'doc.publish', 'report.export', 'report.view.basic']\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-9-doc-publish-a-member-default-again: doc.publish is in the catalog and the member defaults')
