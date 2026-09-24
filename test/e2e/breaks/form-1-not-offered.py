# Take Form back out of the shared list. The module stays complete and stays
# reachable from the Forms rail — which is exactly the state frame `08:00`
# says is wrong: not that forms are missing, that they are unreachable from
# the point where somebody has decided to put something in this space.
# RE-AIMED 24 September: each create type now declares what a guest may do with it
# (`guests`), and both menus ask one hook (`useCreatable`); the mistake is the same.
# Reddens: space-create-menu: "and they are the create kinds, in the shared module's order"
import io
p = "/home/user/rundesk/apps/web/src/lib/create-types.ts"
a = "  { value: 'form', icon: ClipboardType, labelKey: 'quickCreate.tab.form', blurbKey: 'createMenu.blurbForm', inSpace: true, scopedToSpace: true, isContainer: false, guests: 'no' },\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-types.ts: Form is gone from the menu and the tab strip again.')
