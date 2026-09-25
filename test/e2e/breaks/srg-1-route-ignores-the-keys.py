# THE SETTINGS ROUTE ASKS THE ROLE ALONE AGAIN: a key a custom role grants opens no
# tab, and its holder is sent back to the start.
# Reddens: settings-role-grants: "Workspace settings is offered to a member only once a role grants a key one of its tabs serves — the plain member is offered it nowhere (avatar menu, palette, dock, browse list, switcher, rail) and is sent away from its address; the webhook holder is offered it everywhere, and lands in it"
#   or "each grant opens its own tab and card alone — webhooks: Integrations, with Webhooks; SSO: SSO; integrations: Integrations, with Slack — and an admin, every one"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.settings.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    const tabs = settingsTabsFor(false, new Set(held?.permissions ?? []))\n'
b = "    const tabs = settingsTabsFor(false, new Set((held?.permissions ?? []).filter((key) => key === '')))\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-1-route-ignores-the-keys: the route ignores the keys')
