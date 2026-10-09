# THE SHEET OFFERS START TIMER WHATEVER THE SWITCH: the person presses it and is refused.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "the member’s sheet offers no Start timer and no manual entry, and says their workspace has not allowed them to track time there; the estimate cannot be typed in; and a tag can be added"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const mayTrack = useTaskCaps().track !== false\n',
     '  const mayTrack = useTaskCaps().track !== false || true // BROKEN: the timer is offered whatever the switch\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-w1-the-sheet-offers-the-timer-whatever-the-switch: the sheet offers the timer whatever the switch')
