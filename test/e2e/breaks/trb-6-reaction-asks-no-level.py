# A REACTION ASKS NOTHING OF THE COMMENT LEVEL.
# Reddens: task-rows-by-id: "a reaction is to a comment on the task named, by somebody who may comment there: the outsider’s through their own task is not found, and a view-only member’s refused — none written — while a member reacts in an open space"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!onTask) throw new NotFoundException('Comment not found')\n    await this.assertMayComment(taskId, userId)\n"
b = "    if (!onTask) throw new NotFoundException('Comment not found')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('trb-6-reaction-asks-no-level: a reaction asks nothing of the comment level')
