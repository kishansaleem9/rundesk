# MAKING AN API KEY ASKS A KEY EVERY MEMBER HOLDS: a manager makes one.
# Reddens: admin-only-keys: "a manager neither changes the security policy nor makes an API key (403 each, nothing written) — a member granted security.policy.manage changes the policy, and the admin makes a key"
import io
p = '/home/user/rundesk/apps/api/src/modules/security/security.controller.ts'
a = "  @Post()\n  // `security.policy.manage` (`role-editor-offers-unenforced-permissions`).\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('security.policy.manage')\n"
b = "  @Post()\n  @UseGuards(PermissionsGuard)\n  @RequirePermissions('report.view.basic')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('aok-6-api-keys-ask-a-members-key: making an API key asks report.view.basic')
