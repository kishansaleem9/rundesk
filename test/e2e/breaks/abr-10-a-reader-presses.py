# A READER OF THE TASK PRESSES ITS BUTTON.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "a “button is pressed” rule must name a Button (400, in words, for none or a field that is not one); a reader of the task is refused the press and nothing runs; a field that is not a Button is not pressed"
#
# The press asks the read rule, and not the write rule.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (def.type !== 'button') throw new BadRequestException(NOT_A_BUTTON)\n    await assertTaskWritable(this.db, taskId, reader.id)\n",
     "    if (def.type !== 'button') throw new BadRequestException(NOT_A_BUTTON)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-10-a-reader-presses: A READER OF THE TASK PRESSES ITS BUTTON.')
