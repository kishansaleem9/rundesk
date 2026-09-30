# THE TEMPLATES MENU LOSES THE DIVIDER BETWEEN ITS TWO GROUPS.
#
# Frame `00:52` draws the four as two pairs, the ways to make a task from a
# template and the ways to make a template from the task, with a rule between.
# Without it the menu is one run of four look-alike rows.
#
# Reddens: create-modal-templates: "to a template manager, Templates opens the frame’s four over the modal, in two groups with the divider between: Use Template and Create instantly from template, then Save as template and Update existing template"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          {any && mayManage && <DropdownMenuSeparator data-testid="quick-create-tpl-divider" />}\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-14-no-divider: the two groups run together')
