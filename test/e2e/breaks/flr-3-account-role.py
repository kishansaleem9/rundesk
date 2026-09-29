# A ROLE OVERRIDE IS MATCHED AGAINST THE ACCOUNT'S ROLE AGAIN.
# Reddens: flag-resolution: "an override for managers reaches the workspace’s manager — told off, its routes 404 — and not a plain member, who keeps Forms"
#   or "the manager’s “Contact your admin” agrees with their navigation: Forms is off in both, so the ask goes out rather than saying it is already on"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "          (scope === 'role' && row.scopeId === role) ||\n"
b = "          (scope === 'role' && row.scopeId === ctx.role) ||\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("flr-3-account-role: a role override reads the account's role")
