# The gate asks for `admin` rather than `edit`, so the column's own DEFAULT —
# `edit`, on every space that already exists — starts refusing edits it has
# always allowed. A gate that refuses everybody is not this feature, and a
# suite that only ever asserts refusals cannot tell the two apart.
# Reddens: space-default-permission:
#   "the SAME member renaming the SAME kind of list succeeds where the default is `edit`"
#   "while the `edit` space still is — the filter is the permission"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
a = """      required: 'edit',
      kind: params.kind,
"""
b = """      required: 'admin',
      kind: params.kind,
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("container-access.ts: the space gate now demands 'admin', so the column's own default refuses.")
