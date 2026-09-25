# The Default-permission gate moved BELOW the creator short-circuit, so "I made
# this list myself" is an exception to a space nobody may write in. This is the
# commonest way the rule would be quietly avoided: every container a member
# creates in a view-only space stays editable by them forever.
# Re-aimed 25 September: the rule passes the chain a grant is read on now (`project-roles-narrow-nothing`).
# Re-aimed 25 September: Full edit is asked where it was offered (`full-edit-enforced-nowhere`).
# Reddens: space-default-permission:
#   "renaming their OWN list in a view-only space is refused with 403"
#   "and the list really is unchanged"
#   "deleting it is refused too"
#   "`comment` — the rung between — is refused as well"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
a = "  if (params.spaceId) {\n    await assertSpaceLevel(db, {\n      spaceId: params.spaceId,\n      actorId: params.actorId,\n      required: action === 'delete' ? 'admin' : 'edit',\n      kind: params.kind,\n      within: params.within,\n      ...(action === 'delete' ? { act: 'deleting this' } : {}),\n    })\n  }\n\n  // The creator may always manage / delete their own container.\n  if (params.createdById && params.createdById === params.actorId) return\n"
b = "  // The creator may always manage / delete their own container.\n  if (params.createdById && params.createdById === params.actorId) return\n\n  if (params.spaceId) {\n    await assertSpaceLevel(db, {\n      spaceId: params.spaceId,\n      actorId: params.actorId,\n      required: action === 'delete' ? 'admin' : 'edit',\n      kind: params.kind,\n      within: params.within,\n      ...(action === 'delete' ? { act: 'deleting this' } : {}),\n    })\n  }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('container-access.ts: the space gate now runs after the creator short-circuit, so creators escape it.')
