# THE FILES GO WITH THE COPY (`found-30-sep/duplicate-copies-votes-and-files`): a Files field's
# value is written onto a new task as it was held, so a duplicate's copy names attachments of the
# original, which it does not have. Its votes are still left out.
# Reddens: custom-field-progress: "and its Files field names none of the original’s attachments, which the copy does not have — while its other values are copied"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = ("      if (!def) continue\n"
     "      const value = fitTemplateValue(def, v.value, known)\n")
b = ("      if (!def) continue\n"
     "      if (def.type === 'files' && Array.isArray(v.value)) { rows.push({ taskId, fieldId: def.id, value: { v: v.value } }); continue } // BROKEN: the files go with it\n"
     "      const value = fitTemplateValue(def, v.value, known)\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dcv-3-the-files-go-with-the-copy: a Files value is written onto the new task as held')
