# A MERGE ADDS ANY FIELD IT IS ASKED TO, READ FROM ITS UNIT TEST (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`).
#
# Reddens: unit: tasks-merge-fields.test.ts "refuses a field the merged task holds no value for, with one sentence, before reading anything more"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (wanted.some((id) => !lacking.has(id))) throw new BadRequestException(MERGE_FIELD_NOT_ADDABLE)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mvf-6-any-field-may-be-added-unit: a merge adds any field it is asked to')
