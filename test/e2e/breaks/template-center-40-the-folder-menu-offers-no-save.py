# A FOLDER’S ⋯ OFFERS NO SAVE AS TEMPLATE.
# (`found-30-sep/no-save-list-or-folder-as-template`, batch 19)
# Reddens: template-center: "and a folder’s ⋯ saves it as a Folder template, with both its lists and their tasks"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = ('                        {mayManageTemplates && (\n'
     '                        <DropdownMenuItem\n'
     '                          data-testid={`project-save-template-${project.id}`}\n')
b = ('                        {false && mayManageTemplates && ( /* BROKEN: the folder menu offers no save */\n'
     '                        <DropdownMenuItem\n'
     '                          data-testid={`project-save-template-${project.id}`}\n')
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-40-the-folder-menu-offers-no-save: the folder menu has no Save as template')
