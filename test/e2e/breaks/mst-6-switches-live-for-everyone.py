# THE CLICKAPP SWITCHES ARE LIVE FOR EVERY MEMBER WHO OPENS FEATURES.
# Reddens: member-settings-tabs: "a plain member opens Features and sees which ClickApps are on, every switch disabled with the reason said — the admin’s switches are live"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const mayManage = isAdmin || held === true\n'
b = '  const mayManage = isAdmin || held === true || Boolean(1)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mst-6-switches-live-for-everyone: done')
