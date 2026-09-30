# THE ESCAPE THAT ENDS A LEAVING MENU'S EXIT IS KEPT (`found-30-sep/leaving-menu-takes-the-next-escape`): the
# listener that ends the exit stops the Escape as well, in the window's capture phase, so nothing under or over
# the menu hears it. A dialog opened from the menu's own row, drawn over the menu while it leaves, stays open.
# Reddens: menu-reopen: "that Escape closes the dialog opened on top of the leaving menu"
import io
p = '/home/user/rundesk/packages/ui/src/components/dropdown-menu.tsx'
a = "      flushSync(() => {\n        node.dispatchEvent(new AnimationEvent('animationend', { animationName: exit }))\n      })\n"
b = a + "      event.stopPropagation()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('menu-reopen-12-the-ended-exit-keeps-the-escape: the Escape that ends a leaving menu is stopped')
