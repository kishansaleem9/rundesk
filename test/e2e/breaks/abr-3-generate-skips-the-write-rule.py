# A READER OF THE TASK GENERATES ITS AI FIELD.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "a reader of the task is refused before any model is asked (403, nothing kept, no use recorded), as are a field that is not an AI field (400, in words) and an AI field the task has not got (404)"
#
# Generate asks the read rule, and not the write rule.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (!ai) throw new BadRequestException(NOT_AN_AI_FIELD)\n    await assertTaskWritable(this.db, taskId, reader.id)\n",
     "    if (!ai) throw new BadRequestException(NOT_AN_AI_FIELD)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-3-generate-skips-the-write-rule: A READER OF THE TASK GENERATES ITS AI FIELD.')
