# THE PATCH THAT PROVES THE CHECK IS REAL. `assertSpaceLevel` is asked for the
# weakest rung on the ladder instead of the one the caller wanted, so every
# level reaches it and the space's Default permission refuses nobody — exactly
# the state the column was in before this row: written, validated, and read by
# a check that cannot say no.
# Reddens: space-default-permission:
#   "renaming their OWN list in a view-only space is refused with 403"
#   "and the refusal says WHY — the space's default permission, not a generic denial"
#   "and the list really is unchanged — the refusal was not cosmetic"
#   "deleting it is refused too, not only renaming it"
#   "`comment` — the rung between — is refused as well, so the gate is a ladder and not an `=== \"view\"`"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = """): Promise<void> {
  const resolved = await resolveSpaceLevel(db, params)
  if (!resolved) return
"""
b = """): Promise<void> {
  params.required = 'view'
  const resolved = await resolveSpaceLevel(db, params)
  if (!resolved) return
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("space-default-permission.ts: assertSpaceLevel now requires 'view', which every rung reaches — the gate lets everyone through.")
