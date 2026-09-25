# ANY KEY OPENS EVERY TAB: the holder of one sees an admin's fifteen, each refused
# by its routes.
# Reddens: settings-role-grants: "each grant opens its own tab and card alone — webhooks: Integrations, with Webhooks; SSO: SSO; integrations: Integrations, with Slack — and an admin, every one"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const shown = (id: SettingsTabId) => access.tabs.includes(id)\n'
b = "  const shown = (id: SettingsTabId) => access.tabs.length > 0 || id === 'general'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-8-every-tab-for-any-key: every tab for any key')
