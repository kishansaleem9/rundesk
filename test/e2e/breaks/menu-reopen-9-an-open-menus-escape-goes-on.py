# AN OPEN MENU'S ESCAPE GOES ON TO WHAT IS UNDER IT: the caller's Escape handler is dropped, open menu or leaving. (`found-30-sep/leaving-menu-takes-the-next-escape`)
#
# The pass-through over-applied: rather than ending a leaving menu's exit, the
# shared content never runs the caller's `onEscapeKeyDown`. The create modal's
# Templates menu used it to keep the Escape that closes it, so that Escape now
# closes the menu and the modal with it, and the next round finds no modal to
# open its menu in.
#
# Reddens: menu-reopen:
#   "Escape closes the create modal’s open Templates menu, and the modal under it stays open"
#   "the create modal’s Templates menu is closed with Escape, and a second Escape is pressed while it is still leaving (in the page, data-state=\"closed\")"
#   "that second Escape reaches the create modal under the menu, and closes it"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
s = io.open(p, encoding='utf-8').read()
a = '>(({ onPointerDownOutside, ...props }, ref) => {\n'
b = '>(({ onPointerDownOutside, onEscapeKeyDown: _dropped, ...props }, ref) => { // BROKEN: the caller never hears an Escape\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("menu-reopen-9-an-open-menus-escape-goes-on: the shared content drops the caller's onEscapeKeyDown")
