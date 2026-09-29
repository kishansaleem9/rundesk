# THE INVITATION NEVER TURNS: the resting composer shows the first of the four sentences and stays on it.
# Reddens only where a model answers: without one the composer rests on the refusal, which never turns.
# Reddens: ai-answer-rendering: "at rest the invitation turns through the frame’s four sentences in their order, and where no model answers it holds still"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '    if (!composerResting) return\n'
b = '    if (!composerResting || Boolean(1)) return\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('aar-24-the-invitation-never-turns: no timer')
