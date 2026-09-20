# A reference the reader may not see, or one the model invented, is drawn as a
# confident chip with a title in it rather than degrading to inert text.
# Reddens: ai-answer-rendering: "a reference to nothing degrades to inert text instead of asserting a title"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """    return (
      <span
        data-testid={`ai-ref-unresolved-${id}`}
"""
b = """    return (
      <span
        data-testid={`ai-ref-task-${id}`}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: an unresolvable reference renders as a task chip.')
