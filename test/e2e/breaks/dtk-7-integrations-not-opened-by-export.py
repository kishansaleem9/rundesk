# INTEGRATIONS DOES NOT OPEN TO workspace.export: the exporter is sent away from Settings.
# Reddens: data-transfer-keys: "Settings offers the member granted workspace.export the workspace’s data export — and offers the manager no export of the people"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  integrations: ['webhook.manage', 'integrations.manage', 'workspace.export'],\n"
b = "  integrations: ['webhook.manage', 'integrations.manage'],\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-7-integrations-not-opened-by-export: Integrations opens without workspace.export')
