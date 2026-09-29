# THE CHEVRON'S MENU IS DRAWN UNDER THE MODAL, AT THE DROPDOWN'S OWN Z-50: DIMMED BEHIND THE BACKDROP, THOUGH ITS ITEMS STILL TAKE A CLICK.
# Reddens: create-task-chevron: "the chevron beside Create task opens, over the modal, a menu of ClickUp’s four: Create and close, Create and open, Create and start another, Create and duplicate"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '              className="z-[10001] w-56"\n'
b = '              className="w-56"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-12-menu-under-the-modal: the menu is drawn beneath the modal')
