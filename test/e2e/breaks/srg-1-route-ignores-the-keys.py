# THE SETTINGS ROUTE ASKS THE ROLE ALONE AGAIN: a key a custom role grants opens no
# tab, and its holder is sent back to the start.
# Re-aimed 28 September: the route passes the role too (the Archived tab opens to every member).
# Re-aimed 28 September: every member is offered Settings on Archived; the check reads what a plain member is offered and shown.
# Re-aimed 28 September: the route decides only from a cached answer and the page decides when it lands (`settings-blank-on-a-slow-permission-read`), so the keys are ignored where both read them, `settingsTabsFor`.
# Reddens: settings-role-grants: "Workspace settings is offered to every member, and a plain member lands on Archived, with only Trash and Features beside it (avatar menu, palette, dock, browse list, switcher, rail) — the tabs no key opens; the webhook holder is offered it everywhere too, and lands with Integrations beside it; a guest is offered it nowhere and is sent away from its address"
#   or "each grant opens its own tab and card alone — webhooks: Integrations, with Webhooks; SSO: SSO; integrations: Integrations, with Slack — and an admin, every one"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "    (tab) => (member && OPEN_TABS.includes(tab)) || (TAB_KEYS[tab] ?? []).some((key) => granted.has(key)),\n"
b = "    (tab) => (member && OPEN_TABS.includes(tab)) || (TAB_KEYS[tab] ?? []).some((key) => granted.has(key) && Boolean(0)),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-1-route-ignores-the-keys: the route ignores the keys')
