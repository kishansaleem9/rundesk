# THE WEBHOOKS CARD ASKS FOR THE INTEGRATIONS KEY: its own holder is shown nothing.
# Reddens: settings-role-grants: "the webhook holder makes a webhook from Settings — it is made, and its secret is shown once"
#   or "each grant opens its own tab and card alone — webhooks: Integrations, with Webhooks; SSO: SSO; integrations: Integrations, with Slack — and an admin, every one"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayWebhooks = permissions.can('webhook.manage') === true\n"
b = "  const mayWebhooks = permissions.can('integrations.manage') === true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-11-webhooks-card-asks-the-wrong-key: the webhooks card asks the wrong key')
