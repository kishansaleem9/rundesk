# THE CONSOLE READS THE FIRST WORKSPACE, WHATEVER IS PICKED. Every console page shares
# the rule, so this reddens the webhooks page's suite as well.
# Reddens: admin-audit-page: "the audit log offers the admin their workspaces, and reads the one picked — its event shown, the first workspace’s not"
import io
p = '/home/user/rundesk/apps/web/src/components/admin-workspace-picker.tsx'
a = "  const workspaceId = picked || workspaces.data?.[0]?.workspace.id || ''\n"
b = "  const workspaceId = workspaces.data?.[0]?.workspace.id || ''\n  void picked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("aap-1-the-first-workspace-whatever-is-picked: applied")
