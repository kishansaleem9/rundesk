# THE VOTES GO WITH THE COPY (`found-30-sep/duplicate-copies-votes-and-files`): a Voting field's
# value is written onto a new task as it was held, so a duplicate's copy is voted for by the people
# who voted for the original. Its Files value is still left out.
# Reddens: custom-field-progress: "a duplicate of the task carries none of its votes — a vote is cast by its voter on the task they voted on (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = ("      if (!def) continue\n"
     "      const value = fitTemplateValue(def, v.value, known)\n")
b = ("      if (!def) continue\n"
     "      if (def.type === 'voting' && Array.isArray(v.value)) { rows.push({ taskId, fieldId: def.id, value: { v: v.value } }); continue } // BROKEN: the votes go with it\n"
     "      const value = fitTemplateValue(def, v.value, known)\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dcv-2-the-votes-go-with-the-copy: a Voting value is written onto the new task as held')
