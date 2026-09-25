# THE SHARE PANEL OFFERS EVERY LEVEL, Full edit to a sharer at Edit.
# Reddens: share-levels: "the Share panel offers a member at Edit the levels up to Edit and not Full edit, and tells a view-only member they cannot share"
import io
p = '/home/user/rundesk/apps/web/src/components/share-panel.tsx'
a = '              {grantable.map((l) => (\n'
b = '              {LEVELS.map((l) => (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shl-8-panel-offers-every-level: applied')
