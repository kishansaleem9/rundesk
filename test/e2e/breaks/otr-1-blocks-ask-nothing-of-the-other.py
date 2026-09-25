# BLOCKING ANOTHER TASK ASKS ONLY THAT IT CAN BE READ, as it did.
# Reddens: other-task-rules: "a member blocks no task they may only read — refused (403), none made, and its owner closes it — while their own task may wait on it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (type === 'blocks') await this.assertTaskWriteAccess(relatedTaskId, actorId)"
b = '    void type'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('otr-1-blocks-ask-nothing-of-the-other: applied')
