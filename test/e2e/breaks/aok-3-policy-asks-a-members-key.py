# THE SECURITY POLICY ASKS A KEY EVERY MEMBER HOLDS: a manager changes it.
# Reddens: admin-only-keys: "a manager neither changes the security policy nor makes an API key (403 each, nothing written) — a member granted security.policy.manage changes the policy, and the admin makes a key"
import io
p = '/home/user/rundesk/apps/api/src/modules/security/security-settings.controller.ts'
a = "  @RequirePermissions('security.policy.manage')\n"
b = "  @RequirePermissions('report.view.basic')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('aok-3-policy-asks-a-members-key: the policy asks report.view.basic')
