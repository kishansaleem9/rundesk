# Every refusal collapses into one status. "That task does not exist", "you may not
# assign it" and "there is nobody to choose between" all become 404, so the caller
# cannot tell them apart — and a 404 on a caller-supplied id is also a membership
# oracle. A status two mechanisms both produce cannot distinguish them.
# Reddens: ai-assign: "a task that does not exist is refused by NAME, at 200 rather than a bare 404"
#          ai-assign: "saying plainly that nothing was assigned"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = """    const result = await this.ai.suggestAssignee(taskId, user.id)"""
b = """    const result = await this.ai.suggestAssignee(taskId, user.id)
    if (!result.ok) throw new HttpException('Not found', HttpStatus.NOT_FOUND)"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.controller.ts: every assignee refusal is now an indistinguishable 404.')
