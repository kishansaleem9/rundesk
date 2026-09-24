# A SPRINT'S TASKS ARE TAKEN OUT BY ANYBODY: removing asks nothing of the sprint.
# Reddens: sprint-access: "a member moves no task in or out of a private space’s sprint — and takes one out of the open one"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = '  async removeTask(sprintId: string, taskId: string, actor: ReadActor) {\n    await this.assertMayChange(await this.readable(sprintId, actor), actor)\n'
b = '  async removeTask(sprintId: string, taskId: string, actor: ReadActor) {\n    void actor\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-10-tasks-moved-without-being-read: applied")
