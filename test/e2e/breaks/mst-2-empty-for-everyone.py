# EMPTY TRASH IS OFFERED TO EVERYONE WHO OPENS THE TAB, managers included.
# Reddens: member-settings-tabs: "a manager restores what they deleted and is offered neither Delete forever nor Empty trash, which the API refuses them — the admin is offered all three"
import io
p = '/home/user/rundesk/apps/web/src/components/trash-tab.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const canEmpty = isAdmin\n'
b = '  const canEmpty = isAdmin || Boolean(1)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mst-2-empty-for-everyone: done')
