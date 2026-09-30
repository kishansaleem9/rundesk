# A MERGE'S TARGET IS ASKED ITS WORKSPACE AND NOT ITS READ RULE, as the dependency's was before `assertTaskReference`:
# a private target is refused by the write rule ("Task not found") and a private subtask by the merge rule ("Subtasks
# only nest one level deep", 400), where an id naming nothing is "The task to merge into was not found".
# Reddens: refused-as-missing: "merging into a task the member may not open — a private task, one in a private list, and somebody’s private subtask from a task with subtasks of its own — is refused as merging into an id naming nothing, and nothing is merged"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertTaskReference(targetTaskId, workspaceId, actorId, MERGE_REFUSAL_MESSAGE['target-missing'])\n"
b = "    if (target && (await this.resolveWorkspaceForList(target.listId))?.workspaceId !== workspaceId) {\n      throw new NotFoundException(MERGE_REFUSAL_MESSAGE['target-missing'])\n    }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-16-a-merge-target-says-it-is-there: the merge target is asked its workspace, not its read rule')
