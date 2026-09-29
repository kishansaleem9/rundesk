# THE CHIP NAMES THE TASK AND THE TURN DOES NOT.
#
# The dock shows "This task: …" over its composer and sends the list's view
# alone, so the model is asked about "this task" with no task anywhere in its
# context — a control that says more than it does, which is the reason the
# header comment gave for leaving the button out. Everything on the screen is
# right; only the wire is not.
#
# Reddens: brain-entry-points: "a turn asked from the dock goes to the server naming this task — its title and its id — beside the list it is over"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """
          currentView: viewWithScope(currentView, scope),
"""
b = """
          currentView,
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the dock shows the task on its chip and sends the page view without it.')
