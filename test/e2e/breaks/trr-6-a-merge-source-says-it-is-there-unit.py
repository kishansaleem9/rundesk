# `ram-17`'s edit, claimed by the unit test beside the service.
# Reddens: unit: tasks-refused-reads.test.ts "refuses a source the merger may not open, binned or not, as a task that is not there — not as a merge refusal"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const { workspaceId } = await this.assertTaskReadAccess(taskId, actorId)\n    await this.assertTaskReference(targetTaskId, workspaceId, actorId, MERGE_REFUSAL_MESSAGE['target-missing'])\n"
b = "    const workspaceId = (await this.resolveWorkspaceForList(source.listId))?.workspaceId ?? ''\n    await this.assertTaskReference(targetTaskId, workspaceId, actorId, MERGE_REFUSAL_MESSAGE['target-missing'])\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trr-6-a-merge-source-says-it-is-there-unit: the merge source is not asked the read rule first')
