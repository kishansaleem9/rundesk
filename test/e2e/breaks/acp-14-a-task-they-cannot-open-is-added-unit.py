# A TASK THE TEAMMATE CANNOT OPEN GOES ON THEIR PRIORITIES, asked of the service itself (`ledger-rows/row-850`).
# Reddens: unit: people.service.test.ts "refuses a task the colleague may not open (403), asked as the colleague, and writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = """    if (!(await this.mayOpenTask(workspaceId, taskId, { id: userId, role: target.platformRole }))) {
      throw new ForbiddenException(
        `${target.displayName || 'That person'} cannot open this task, so it cannot go on their priorities`,
      )
    }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-14-a-task-they-cannot-open-is-added-unit: the colleague\'s own read of the task is not asked')
