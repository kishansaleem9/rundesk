# A LIST MOVES WITHOUT ITS OWN FIELDS (`found-6-oct/list-move-strands-its-fields`).
#
# A list moved to another project takes the fields kept to it, in the move's
# transaction. Let it change only its project, as it did, and its own field is
# left in the old project with the list's id: the list's task stops showing it.
#
# Reddens: custom-field-access: "a list moved to another project takes the field kept to it: the field is the new project’s, and the list’s task still shows its value — while the old project’s own field is no longer shown on it, its value kept"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = """      await tx
        .update(customFieldDefinitions)
        .set({ projectId: targetProjectId, updatedAt: new Date() })
        .where(eq(customFieldDefinitions.listId, listId))
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cfa-8-a-list-moves-without-its-fields: a list moves without its own fields')
