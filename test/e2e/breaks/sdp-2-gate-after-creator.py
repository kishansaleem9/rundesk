# The Default-permission gate moved BELOW the creator short-circuit, so "I made
# this list myself" is an exception to a space nobody may write in. This is the
# commonest way the rule would be quietly avoided: every container a member
# creates in a view-only space stays editable by them forever.
# Re-aimed 25 September: the rule passes the chain a grant is read on now (`project-roles-narrow-nothing`).
# Reddens: space-default-permission:
#   "renaming their OWN list in a view-only space is refused with 403"
#   "and the list really is unchanged"
#   "deleting it is refused too"
#   "`comment` — the rung between — is refused as well"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
a = """  if (params.spaceId) {
    await assertSpaceLevel(db, {
      spaceId: params.spaceId,
      actorId: params.actorId,
      required: 'edit',
      kind: params.kind,
      within: params.within,
    })
  }

  // The creator may always manage / delete their own container.
  if (params.createdById && params.createdById === params.actorId) return
"""
b = """  // The creator may always manage / delete their own container.
  if (params.createdById && params.createdById === params.actorId) return

  if (params.spaceId) {
    await assertSpaceLevel(db, {
      spaceId: params.spaceId,
      actorId: params.actorId,
      required: 'edit',
      kind: params.kind,
      within: params.within,
    })
  }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('container-access.ts: the space gate now runs after the creator short-circuit, so creators escape it.')
