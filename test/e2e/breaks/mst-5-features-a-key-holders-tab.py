# FEATURES OPENS TO KEY HOLDERS ALONE AGAIN.
# Reddens: member-settings-tabs: "a plain member opens Features and sees which ClickApps are on, every switch disabled with the reason said — the admin’s switches are live"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "const OPEN_TABS: readonly SettingsTabId[] = ['archived', 'trash', 'features']"
b = "const OPEN_TABS: readonly SettingsTabId[] = ['archived', 'trash']"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mst-5-features-a-key-holders-tab: done')
