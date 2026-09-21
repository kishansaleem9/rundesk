# The word stops being a report and becomes decoration: one state for every turn,
# which looks identical on a turn that has already died.
# Reddens: ai-answer-rendering: "and before the first frame arrives it says it is thinking, in words"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """  if (hasText) return 'writing'
  if (steps.some((s) => ACTION_STEPS.has(s))) return 'acting'
  return 'thinking'
"""
b = """  void hasText
  void steps
  return 'writing'
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the busy state always says the same thing.')
