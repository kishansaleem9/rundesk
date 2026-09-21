# Put `createTask` back the way it was: insert the task_assignees rows and tell
# nobody. This is the shipped bug, restored — no notification, no task.assigned
# event, no task.assignee_changed automation, nothing for watchers.
#
# Reddens: video1-acceptance:
#   "the peer assigning a task puts something in this account's inbox"
# and, downstream of an empty inbox:
#   "§G10-12 Clear all is there even with nothing unread"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """    for (const userId of bornAssignees) {
      await this.announceAssignment({ taskId: task.id, assigneeId: userId, actorId: data.createdById })
    }
"""
b = """    void bornAssignees
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: a task created with assignees announces nothing again.')
