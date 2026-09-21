# Adding a checklist item stops being logged. The item appears, the count
# moves, and the activity feed says nothing — a checklist can gain ten lines in
# silence, which is the one thing the feed exists to prevent.
#
# Reddens: checklists: "adding an item is logged at all"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """    await this.logActivity({
      taskId: parent.taskId,
      actorId,
      action: 'checklist_item_added',
      meta: { itemId: item.id, content: item.content, checklist: parent.title },
    })
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: a checklist item can be added without any activity entry.')
