# SETTINGS' CLICKAPP SWITCHES ASK THE ADMIN ROLE ALONE, AS THEY DID: the member granted workspace.clickapps.manage is shown every switch dead.
# Reddens: clickapp-flags-access: "Settings opens Features to the member granted workspace.clickapps.manage, every ClickApp switch live and no “admins only” notice"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const mayManage = isAdmin || held === true\n'
b = '  const mayManage = isAdmin\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cka-7-switches-ask-the-admin-role: the Features switches ask isAdmin')
