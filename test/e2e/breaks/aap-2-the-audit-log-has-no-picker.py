# THE AUDIT LOG OFFERS NO PICKER, as before: the other console pages keep theirs.
# Re-aimed 29 September: the trail is a panel the console hands its picker to, and Settings hands none (`workspace-audit-log-not-in-settings`).
# Reddens: admin-audit-page: "the audit log offers the admin their workspaces, and reads the one picked — its event shown, the first workspace’s not"
import io
p = '/home/user/rundesk/apps/web/src/pages/admin-audit-page.tsx'
a = '        picker={\n          <AdminWorkspacePicker\n            testId="admin-audit-workspace"\n            workspaces={workspaces.data}\n            value={workspaceId}\n            onChange={setWorkspaceId}\n            className="h-9 py-0 px-2 min-w-44"\n          />\n        }\n'
b = '        picker={void setWorkspaceId}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("aap-2-the-audit-log-has-no-picker: applied")
