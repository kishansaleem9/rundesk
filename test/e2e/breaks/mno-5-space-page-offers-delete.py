# THE SPACE PAGE'S MENU OFFERS DELETE TO EVERYONE.
# Reddens: menu-offers: "the space page’s menu tells a plain member there is nothing there for them to change, and offers no Delete"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-space-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              {offer.delete !== false && (\n'
b = '              {(offer.delete !== false || Boolean(1)) && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mno-5-space-page-offers-delete: done')
