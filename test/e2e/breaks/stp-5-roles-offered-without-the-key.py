# EVERY MEMBER’S ROLE IS OFFERED FOR CHANGE, WITHOUT members.role.change: the manager is shown selects the API refuses.
# Reddens: settings-tabs-by-key: "the manager opens Settings on Members alone, offered the invite form — and no member’s role to change nor anyone to remove, keys a manager does not hold"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              {mayChangeRole && withinRank(own, m.role) ? (\n'
b = '              {(mayChangeRole || true) && withinRank(own, m.role) ? (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-5-roles-offered-without-the-key: role selects for every member')
