# A MERGE'S SOURCE IS NOT ASKED THE READ RULE BEFORE THE MERGE RULE: a stranger merging a real task into nothing is
# told the TARGET is missing, and a binned task is "A task in the bin cannot be merged" (400) to people who may not
# open it, where a source naming nothing is "Task not found".
# Reddens: refused-as-missing: "a task merged away by somebody who may not open it is not there — a user of another organisation merging this workspace’s task into nothing, or its binned task into another, and the member merging a binned private task, are each answered as for an id naming nothing, not by the merge rule"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const { workspaceId } = await this.assertTaskReadAccess(taskId, actorId)\n    await this.assertTaskReference(targetTaskId, workspaceId, actorId, MERGE_REFUSAL_MESSAGE['target-missing'])\n"
b = "    const workspaceId = (await this.resolveWorkspaceForList(source.listId))?.workspaceId ?? ''\n    await this.assertTaskReference(targetTaskId, workspaceId, actorId, MERGE_REFUSAL_MESSAGE['target-missing'])\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-17-a-merge-source-says-it-is-there: the merge source is not asked the read rule first')
