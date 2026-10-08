# A MERGE ADDS ANY FIELD IT IS ASKED TO (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`).
#
# Only a field the merged task holds a value for, which the survivor lacks, can
# be added. Let any be, and a merge asked to add Note, which the survivor has,
# goes through.
#
# Reddens: task-merge: "and the survivor’s own value is kept where it holds one, the merged value staying on the binned task; a field the survivor has is refused in one sentence, and nothing is merged"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (wanted.some((id) => !lacking.has(id))) throw new BadRequestException(MERGE_FIELD_NOT_ADDABLE)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mvf-12-any-field-may-be-added: a merge adds any field it is asked to')
