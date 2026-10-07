# A MENU IS AS TALL AS THE ROOM RADIX WORKS OUT, TO THE WINDOW'S FOOT, and is drawn at a whole pixel below
# where that room was worked out from: the user menu, 51.5 px down, is drawn at 52 and ends at 900.5 in a
# 900 px window (`found-30-sep/sw-api-cache-reads-the-menu-box-once`).
# Reddens: sw-api-cache: "and the topbar’s Sign out — its menu inside a 1440×900 window — does the same for a member"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
a = '>(({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) => (\n'
b = '>(({ className, sideOffset = 6, collisionPadding = 0, ...props }, ref) => (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('swc-8-a-menu-is-as-tall-as-its-room: dropdown-menu.tsx: no padding from the window\'s edge.')
