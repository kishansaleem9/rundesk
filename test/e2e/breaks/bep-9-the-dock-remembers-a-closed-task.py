# THE CHIP GOES WHEN THE TASK CLOSES, AND THE TASK GOES ON BEING SENT.
#
# The inverse of the chip-without-the-wire defect: the panel keeps the last
# task it was pointed at and sends it with every later turn, so the screen
# says "the page" and the model is still told "this task". Nothing on the
# screen can show it — the chip is gone, correctly — which is why the check
# after the close reads the NEXT turn off the wire rather than the chip.
#
# Reddens: brain-entry-points: "and the dock’s next turn names no task: it goes out with the list’s view alone"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """
          currentView: viewWithScope(currentView, scope),
"""
b = """
          currentView: viewWithScope(currentView, ((window as any).__rdLastScope = scope ?? (window as any).__rdLastScope)),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the dock keeps sending the last task it was pointed at, after it closes.')
