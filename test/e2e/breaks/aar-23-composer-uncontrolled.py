# Remove the composer's `onChange` again — the shipped bug, restored.
#
# `value={input}` with no handler is a fully controlled input: React writes
# `input` back into the DOM node on every render, so each keystroke is reverted
# before it can be seen. The box is enabled, editable, visible, and inert.
#
# Reddens: ai-answer-rendering:
#   'after "create a " it offers the frame's own three: new · list · list of'
#   'and after "and after \"…name as \" it offers the frame’s other three: the · a · you" it offers the frame's other three: the · a · you'
#   'a half-typed word is COMPLETED from what the product can be asked to do'
#   'pressing a word REPLACES the half-typed stem rather than appending to it'
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """            onChange={(e) => setInput(e.target.value)}
            data-testid="ai-composer-input\""""
b = """            data-testid="ai-composer-input\""""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the AI composer cannot be typed into again.')
