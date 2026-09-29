# A REPLY FOR ANY TASK: the reply route asks nothing of the task before it drafts.
# Reddens: brain-entry-points: "and a reply is drafted only for a task that is there: one that is not is refused (404), and none named is refused (400), with or without a model"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = "    if (!body.taskId) throw new HttpException('taskId is required', HttpStatus.BAD_REQUEST)\n    await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })\n    await this.ai.assertAvailable('comment.reply'"
b = "    await this.ai.assertAvailable('comment.reply'"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bep-21-a-reply-for-any-task: the task rule is skipped')
