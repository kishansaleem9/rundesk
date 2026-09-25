# THE IMPORTER'S CARD IS SHOWN TO A WEBHOOK HOLDER, whose importer route refuses them.
# Reddens: settings-role-grants: "each grant opens its own tab and card alone — webhooks: Integrations, with Webhooks; SSO: SSO; integrations: Integrations, with Slack — and an admin, every one"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      {isAdmin && (\n        <Card className="p-4" data-testid="settings-card-import">'
b = '      {(isAdmin || mayWebhooks) && (\n        <Card className="p-4" data-testid="settings-card-import">'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-10-importer-for-any-key: the importer card for a webhook holder')
