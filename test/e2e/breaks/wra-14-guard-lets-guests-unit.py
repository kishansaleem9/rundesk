# THE GUARD LETS A WORKSPACE GUEST THROUGH, measured by its own unit test.
# Reddens: unit: named-workspace-member.guard.test.ts "refuses a guest of the workspace, whatever the account-wide role says"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/named-workspace-member.guard.ts'
a = "    if (member.role === 'guest') throw new ForbiddenException('Guests cannot use this feature')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-14-guard-lets-guests-unit: applied")
