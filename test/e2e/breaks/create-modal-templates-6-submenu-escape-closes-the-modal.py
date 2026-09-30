# AN ESCAPE IN A TEMPLATES SUBMENU GOES ON TO CLOSE THE WHOLE MODAL.
#
# The modal closes on any Escape that reaches the document. The menu keeps its
# own, and without this the submenu's does not: the Escape meant to close a
# list of templates throws away the half-written task.
#
# Reddens: create-modal-templates: "Escape with a submenu open closes the menu and leaves the modal open with what was typed"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      <DropdownMenuSubContent className="z-[10002] w-60" data-testid={`quick-create-tpl-list-${prefix}`} onEscapeKeyDown={keepEscape}>\n'
b = '      <DropdownMenuSubContent className="z-[10002] w-60" data-testid={`quick-create-tpl-list-${prefix}`}>\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-6-submenu-escape-closes-the-modal: a submenu lets its Escape reach the modal')
