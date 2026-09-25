# SSO IS OPENED BY THE WEBHOOK KEY TOO: a tab for a key that does not serve it.
# Reddens: settings-role-grants: "each grant opens its own tab and card alone — webhooks: Integrations, with Webhooks; SSO: SSO; integrations: Integrations, with Slack — and an admin, every one"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  sso: ['sso.manage'],\n"
b = "  sso: ['sso.manage', 'webhook.manage'],\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-9-sso-opened-by-webhooks: SSO opened by webhook.manage')
