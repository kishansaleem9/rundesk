# The wire still reports the row it created and nothing reads it, so the sentence
# becomes the only account of what happened — the mirror of the facade.
# Reddens: ai-answer-rendering: "and what the server said it created is shown beside the answer"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "        created: collectedCreated.length ? collectedCreated : undefined,\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: what the server created is collected and then thrown away.')
