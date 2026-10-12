# A FIELD SET TO FILL NEW TASKS FILLS ONE MADE A MOMENT BEFORE IT.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "Generate fills the Summary: the model was asked with the task’s title, description and comments, its answer is the field’s value (read by SQL), and the use is metered to the asker"
#
# Autofill asks no field when it was made.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      .filter((d) => which !== 'autofill' || !made || d.createdAt <= made.createdAt)",
     "      .filter((d) => which !== 'autofill' || !made || d.createdAt <= new Date())"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-8-autofill-fills-older-tasks: A FIELD SET TO FILL NEW TASKS FILLS ONE MADE A MOMENT BEFORE IT.')
