# CREATE AND START ANOTHER KEEPS THE LAST TASK'S TITLE: THE NEXT PRESS MAKES IT AGAIN.
# Reddens: create-task-chevron: "Create and start another makes one task from what was typed and leaves the modal open on an empty form, in the same space, project and list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "  const startAnother = () => {\n    setTitle('')\n"
b = '  const startAnother = () => {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-8-another-keeps-the-title: the title survives Create and start another')
