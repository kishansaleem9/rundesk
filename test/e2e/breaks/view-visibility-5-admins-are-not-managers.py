# THE ROLE LIST AS IT WAS: `owner`, `admin` and `manager` — so a manager may change a protected view and a workspace admin may not.
# Reddens: view-visibility: "a workspace admin may change a member’s protected view, as a manager may"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = '    return !!row && isManagerRole(row.role)\n'
b = "    return !!row && ['owner', 'admin', 'manager'].includes(row.role as string)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("view-visibility-5-admins-are-not-managers: applied")
