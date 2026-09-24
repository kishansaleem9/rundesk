# THE GUARD LETS A WORKSPACE GUEST USE THE AI, as the account-wide check did.
# Reddens: workspace-read-access: "and a guest of the workspace is refused them too"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/named-workspace-member.guard.ts'
a = "    if (member.role === 'guest') throw new ForbiddenException('Guests cannot use this feature')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-13-guard-lets-guests: applied")
