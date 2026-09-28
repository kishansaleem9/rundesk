# THE MEMBERS TAB IS AN ADMIN’S AGAIN: the manager, who may invite, is sent away from Settings.
# Re-aimed 28 September: Members also opens to members.profile.manage.
# Reddens: settings-tabs-by-key: "the manager opens Settings on Members alone, offered the invite form — and no member’s role to change nor anyone to remove, keys a manager does not hold"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  members: ['members.invite', 'members.remove', 'members.role.change', 'members.profile.manage'],\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-4-members-tab-admins-only: Members opens to admins alone')
