# The picker opens and lists nobody, so "+ New message" is a text box that
# cannot start a conversation — which is exactly what folding DMs in under
# `+ Add Channel` would have produced.
# Reddens: sidebar-dms "and it offers the workspace roster, not a name box"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "  const needle = query.trim().toLowerCase()\n"
b = "  // BROKEN: the roster is fetched and never offered.\n  const needle = 'zzzz-no-such-person'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the "+ New message" picker lists nobody.')
