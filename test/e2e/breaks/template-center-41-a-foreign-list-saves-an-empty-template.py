# A LIST OF ANOTHER FOLDER SAVES AN EMPTY TEMPLATE instead of being refused.
# (`found-30-sep/no-save-list-or-folder-as-template`, batch 19)
# Reddens: template-center: "and a list of another folder, named with this one, is refused as not found in it (404), and no template is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    if (onlyList && projectLists.length === 0) throw new NotFoundException('List not found in this project')\n"
b = '    // BROKEN: a foreign list saves an empty template\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-41-a-foreign-list-saves-an-empty-template: a list not in the folder is not refused')
