# CREATE AND OPEN OPENS ONLY WHEN A PROJECT WAS PICKED, AS THE PRIMARY BUTTON DOES: A LIST UNDER THE SPACE ALONE OPENS NOTHING.
# Reddens: create-task-chevron: "Create and open makes one task, closes the modal and opens the new task’s sheet on its list, here a list picked under the space alone"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '    const container = projectId || lists.find((l) => l.id === listId)?.projectId\n'
b = '    const container = projectId\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ctc-7-open-needs-a-project: the list row's container is not read")
