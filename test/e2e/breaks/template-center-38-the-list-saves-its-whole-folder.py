# A LIST SAVED AS A TEMPLATE TAKES ITS WHOLE FOLDER, and a list of another folder is not refused.
# (`found-30-sep/no-save-list-or-folder-as-template`, batch 19)
# Reddens: template-center:
#   "a list’s ⋯ in the sidebar saves it as a List template, under the list’s name to begin with: the list alone, with its task, and the tags typed (read from the database)"
#   "and a list of another folder, named with this one, is refused as not found in it (404), and no template is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = '      .where(and(eq(lists.projectId, dto.projectId), listVisibilityFilter(actor.id, isManager), ...(onlyList ? [eq(lists.id, onlyList)] : [])))\n'
b = '      .where(and(eq(lists.projectId, dto.projectId), listVisibilityFilter(actor.id, isManager))) // BROKEN: the list saves its whole folder\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-38-the-list-saves-its-whole-folder: listId names nothing')
