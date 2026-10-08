# A DOUBLE-CLICK'S SECOND PRESS SHUTS THE DIALOG ITS FIRST OPENED (`found-30-sep/a-double-click-on-a-dialog-row-shuts-the-dialog`).
#
# A dialog refuses a press outside that comes within a double-click's interval
# of its opening. Let the interval be nothing, as it was, and a person-paced
# double-click on the task menu's "Merge" opens the dialog with its first press
# and shuts it with its second, on the overlay.
#
# Reddens: menu-reopen: "a person-paced double-click on the task menu’s “Merge” opens its dialog and leaves it open: the second press is the same gesture, not a press outside"
import io
p = '/home/user/rundesk/packages/ui/src/components/dialog.tsx'
a = "export const DOUBLE_CLICK_MS = 500\n"
b = "export const DOUBLE_CLICK_MS = 0\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('menu-reopen-13-a-double-clicks-second-press-shuts-the-dialog: every press outside a dialog shuts it')
