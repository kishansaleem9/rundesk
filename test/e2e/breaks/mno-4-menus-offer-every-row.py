# THE MENUS OFFER EVERY ROW WHATEVER THE ANSWER, as they did before they asked.
# Reddens: menu-offers: "the sidebar offers a plain member no Delete on the admin’s space, no Archive on the admin’s project and no Delete on the admin’s folder"
import io
p = '/home/user/rundesk/apps/web/src/components/menu-offers.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      ? read(q.data)\n'
b = '      ? { manage: true, delete: true }\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mno-4-menus-offer-every-row: done')
