# "Without an explicit grant" dropped from the contract: the space default now
# overrides a real `space_members` / `object_shares` grant instead of standing
# behind it. Giving somebody edit on a view-only space would silently do
# nothing — a permission UI that writes a row nobody reads, which is the same
# defect class this row exists to close.
# Reddens: space-default-permission:
#   "and now the same PUT succeeds — the default is a FALLBACK, not a ceiling"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = """  const explicit = strongest(memberLevel, shareLevel)
  if (explicit) {
    return { level: explicit, source: explicit === memberLevel ? 'space-member' : 'object-share' }
  }
"""
b = """  const explicit = null
  if (explicit) {
    return { level: explicit, source: explicit === memberLevel ? 'space-member' : 'object-share' }
  }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('space-default-permission.ts: explicit space grants are ignored, so the default is a ceiling rather than a fallback.')
