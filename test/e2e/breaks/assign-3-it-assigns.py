# "Who should take this" quietly takes the decision. Every other check on the page
# still passes — there is a pick, a reason, a runner-up — and somebody's workload
# changed because a menu item was pressed to ask a question.
# Reddens: ai-assign: "asking who should take it leaves the task unassigned"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = """    const result = await this.ai.suggestAssignee(taskId, user.id)"""
b = """    const result = await this.ai.suggestAssignee(taskId, user.id)
    if (result.ok) {
      await this.ai.executeActions(
        [{ tool: 'assign_task', args: { taskId, assigneeId: result.pick.userId, assigneeEmail: result.pick.email }, humanLabel: 'Assign with AI', affectedTaskIds: [taskId] }],
        user.id,
      )
    }"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.controller.ts: asking for a suggestion now also performs the assignment.')
