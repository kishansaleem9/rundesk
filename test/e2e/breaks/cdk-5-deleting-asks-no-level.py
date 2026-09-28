# DELETING ASKS NO LEVEL: a key reaches past Edit and View only.
# Reddens: container-delete-keys: "a key does not reach past the level: where the space is Edit or View only for them, the members granted list.delete, project.delete and space.delete delete nothing (403 each, the refusal naming the level) and it all stays"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (params.spaceId) {\n    await assertSpaceLevel(db, {\n'
b = "  if (params.spaceId && params.action !== 'delete') {\n    await assertSpaceLevel(db, {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-5-deleting-asks-no-level: deleting skips the space level')
