# THE AUDIT LOG IS ONE OF THE TABS EVERY MEMBER OPENS.
# Reddens: audit-log-settings: "a plain member is offered no Audit log tab, is taken to a tab of theirs from its address, and the trail answers them 403"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "const OPEN_TABS: readonly SettingsTabId[] = ['archived', 'trash', 'features']\n"
b = "const OPEN_TABS: readonly SettingsTabId[] = ['archived', 'trash', 'features', 'auditLog']\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('als-5-open-to-every-member: every member is offered the tab')
