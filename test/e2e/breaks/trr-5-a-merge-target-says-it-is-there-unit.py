# `ram-16`'s edit, claimed by the unit test beside the service.
# Reddens: unit: tasks-refused-reads.test.ts "refuses a private target — and a private subtask, merged into from a task with subtasks — as a target that is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertTaskReference(targetTaskId, workspaceId, actorId, MERGE_REFUSAL_MESSAGE['target-missing'])\n"
b = "    if (target && (await this.resolveWorkspaceForList(target.listId))?.workspaceId !== workspaceId) {\n      throw new NotFoundException(MERGE_REFUSAL_MESSAGE['target-missing'])\n    }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trr-5-a-merge-target-says-it-is-there-unit: the merge target is asked its workspace, not its read rule')
