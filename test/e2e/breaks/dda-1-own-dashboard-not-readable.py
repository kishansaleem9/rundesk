# THE READ RULE FORGETS THE SETTER'S OWN DASHBOARD: the admin cannot make their own dashboard the default (404).
# Reddens: default-dashboard-access: "a workspace admin who is not a super-admin sets their dashboard as the workspace default, clears it, and sets it again"
import io
p = '/home/user/rundesk/apps/api/src/modules/dashboards/dashboards.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (preset.userId === userId) return true\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("dda-1-own-dashboard-not-readable: the setter's own preset is not read as theirs")
