# THE PICKER HAS NO ⚡ ASSIGN WITH AI AGAIN: the footer is gone, and the route has no reader.
# Reddens: assign-with-ai-picker: "the picker’s ⚡ Assign with AI suggests the member with no open work, by name, with the reason in their own numbers — the suggestion route’s pick"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "      <AssignWithAi\n        taskId={taskId}\n        pending={pending}\n        onAssign={(userId) => {\n          onPick(userId)\n          setOpen(false)\n          setQuery('')\n        }}\n      />\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("awa-1-no-footer: applied")
