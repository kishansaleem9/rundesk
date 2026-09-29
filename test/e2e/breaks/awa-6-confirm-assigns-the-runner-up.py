# CONFIRMING ASSIGNS THE RUNNER-UP: the pick is shown, and somebody else is assigned.
# Reddens: assign-with-ai-picker: "nothing is assigned until the suggestion is confirmed, and confirming assigns the suggested member"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '            onClick={() => onAssign(answer.pick.userId)}\n'
b = '            onClick={() => onAssign(answer.runnerUp?.userId ?? answer.pick.userId)}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("awa-6-confirm-assigns-the-runner-up: applied")
