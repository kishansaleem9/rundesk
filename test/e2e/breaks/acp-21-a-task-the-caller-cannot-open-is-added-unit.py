# A CALLER ADDS A TASK THEY MAY NOT OPEN TO A COLLEAGUE'S LIST (`ledger-rows/row-850`): only the colleague's read is asked, so a private task's id is enough.
# Measured 29 September: it reddens the refused-colleague test beside it too, which asserts the caller is asked first.
# Reddens: unit: people.service.test.ts "answers a task the caller may not open as not found (404)"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = """    if (!(await this.mayOpenTask(workspaceId, taskId, caller))) {
      // Not found, as on your own list: a task you may not open does not exist to you.
      throw new NotFoundException('That task is not in this workspace')
    }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-21-a-task-the-caller-cannot-open-is-added-unit: the caller\'s own read of the task is not asked')
