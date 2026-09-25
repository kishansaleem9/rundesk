# GENERAL IS AN ADMIN’S AGAIN: a member granted workspace.manage is sent away.
# Reddens: settings-tabs-by-key: "a member granted workspace.manage opens Settings on General, offered the workspace’s name — and no billing, which is workspace.billing’s"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  general: ['workspace.manage'],\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-9-general-admins-only: General opens to admins alone')
