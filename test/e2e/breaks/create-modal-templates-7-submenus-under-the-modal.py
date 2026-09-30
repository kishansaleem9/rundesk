# THE TEMPLATES SUBMENUS ARE DRAWN UNDER THE MODAL.
#
# Portalled with the dropdown's own z-50, beneath the modal's z-[10000]: the
# list of templates opens behind the dialog it belongs to, where nobody can
# see it. A test can still click it, because a menu turns the page's pointer
# events off, which is why the suite asks what is painted there.
#
# Reddens: create-modal-templates: "Use Template lists the workspace’s task templates by name, over the modal"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      <DropdownMenuSubContent className="z-[10002] w-60" data-testid={`quick-create-tpl-list-${prefix}`} onEscapeKeyDown={keepEscape}>\n'
b = '      <DropdownMenuSubContent className="w-60" data-testid={`quick-create-tpl-list-${prefix}`} onEscapeKeyDown={keepEscape}>\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-7-submenus-under-the-modal: the submenus sit at z-50, under the modal')
