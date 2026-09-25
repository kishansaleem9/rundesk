# A VOTE ASKS THE TASK WRITE RULE, AS IF IT WERE A CHANGE TO THE TASK.
# Reddens: field-writes-by-level: "a vote is the voter’s own, and anybody who can see the task casts one — the member votes in the view-only space, read back"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (reader && def.type !== 'voting') await assertTaskWritable(this.db, taskId, reader.id)\n"
b = '    if (reader) await assertTaskWritable(this.db, taskId, reader.id)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fwl-2-votes-ask-the-write-rule: a vote asks the task write rule, as if it were a change to the task')
