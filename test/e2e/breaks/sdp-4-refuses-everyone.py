# The gate asks for `admin` rather than `edit`, so the column's own DEFAULT —
# `edit`, on every space that already exists — starts refusing edits it has
# always allowed. A gate that refuses everybody is not this feature, and a
# suite that only ever asserts refusals cannot tell the two apart.
# Re-aimed 25 September: managing asks Edit and deleting Full edit now (`full-edit-enforced-nowhere`); the patch asks Full edit of managing too, so an Edit space refuses renames it allows.
# Re-aimed 29 September: the claim in the one shape the checker reads (it read as unreadable), naming what the patch reddens.
# Reddens: space-default-permission: "the SAME member renaming the SAME kind of list succeeds where the default is `edit`"
#   or "and now the same PUT succeeds — the default is a FALLBACK, not a ceiling"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
a = "      required: action === 'delete' ? 'admin' : 'edit',\n      kind: params.kind,\n"
b = "      required: 'admin',\n      kind: params.kind,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("container-access.ts: the space gate now demands 'admin', so the column's own default refuses.")
