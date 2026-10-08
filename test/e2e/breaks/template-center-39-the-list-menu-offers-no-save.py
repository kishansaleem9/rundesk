# A LIST’S ⋯ OFFERS NO SAVE AS TEMPLATE.
# (`found-30-sep/no-save-list-or-folder-as-template`, batch 19)
# Reddens: template-center: "a list’s ⋯ in the sidebar saves it as a List template, under the list’s name to begin with: the list alone, with its task, and the tags typed (read from the database)"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = '                              {mayManageTemplates && ownerProjectId && (\n'
b = '                              {false && mayManageTemplates && ownerProjectId && ( /* BROKEN: the list menu offers no save */\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-39-the-list-menu-offers-no-save: the list menu has no Save as template')
