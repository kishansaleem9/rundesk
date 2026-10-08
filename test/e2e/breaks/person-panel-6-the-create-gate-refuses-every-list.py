# The create gate refuses every list (`found-8-oct/person-panel-reads-a-refused-fixture-as-a-wrong-bucket`).
#
# What the runner did to person-panel at 802554a, whatever its cause: every
# POST /tasks into the list it chose was refused while its reads, its sign-ins
# and its restores answered. The suite kept only `data`, read the tasks it had
# never been given as tasks in the wrong bucket, and threw at `bDelegated.id`.
# With every list refused here, the suite has to say so, in the one check that
# its fixtures were made, with what the server answered.
#
# Reddens: person-panel: "the tasks the bucket checks look for are made: each one seeded, and assigned where it is asked to be"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """  async assertCanCreateTaskIn(listId: string, actorId: string): Promise<{ workspaceId: string; spaceId: string; projectId: string }> {
    return assertCanCreateTaskIn(this.db, listId, actorId)
  }
"""
b = """  async assertCanCreateTaskIn(listId: string, actorId: string): Promise<{ workspaceId: string; spaceId: string; projectId: string }> {
    throw new ForbiddenException('You cannot add tasks to this list')
  }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('person-panel-6-the-create-gate-refuses-every-list: no list takes a task')
