# THE TRASH TAB IS AN ADMIN'S AGAIN: members are not offered it.
# Reddens: member-settings-tabs: "a plain member opens Settings → Trash and finds the list they deleted there, and nothing anybody else deleted"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "const OPEN_TABS: readonly SettingsTabId[] = ['archived', 'trash', 'features']"
b = "const OPEN_TABS: readonly SettingsTabId[] = ['archived', 'features']"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mst-1-trash-an-admins-tab: done')
