# A task with subtasks taken as a subtask: a second level the list cannot draw.
#
# Reddens: list-views: "dropping a task that has subtasks onto another is refused, and the tree is as the server has it"
import io
p="/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
s=io.open(p,encoding='utf-8').read()
a="      if (child) {\n        throw new BadRequestException('A task with subtasks cannot become a subtask itself')\n      }\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
