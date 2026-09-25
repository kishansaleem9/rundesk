# Creation consults the space's Default permission nowhere again — the shipped
# hole, restored. A member in a "View only" space cannot rename a list, cannot
# delete one, and can freely make a new one.
#
# RE-AIMED 24 September: the gate passes a guest's chain through (`within`).
# Re-aimed 25 September: Full edit is asked where it was offered (`full-edit-enforced-nowhere`).
# Reddens: space-default-permission:
#   "creating a list in a view-only space is refused with 403"
#   "and it says WHY, in the same words the rename refusal uses"
#   "and no list was actually written — the refusal was not cosmetic"
#   "and \"Comment\" refuses it too — the rung below `edit`, not only the bottom one"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
a = "  if (!params.spaceId || !params.actorId) return\n  await assertSpaceLevel(db, {\n    spaceId: params.spaceId,\n    actorId: params.actorId,\n    required: 'admin',\n    kind: params.kind,\n    within: params.within,\n    act: 'adding a',\n  })"
b = """  void db
  void params
  return"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('container-access.ts: creating a container consults the space default nowhere again.')
