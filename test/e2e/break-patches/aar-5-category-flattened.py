# The category every badge colours itself by collapses to one value on the server, so
# a finished task and an untouched one are drawn identically inside a sentence.
# Reddens: ai-answer-rendering: "its category moved with it, and the OTHER chip did not move at all"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "        statusCategory: String(t.statusCategory ?? 'open'),\n"
b = "        statusCategory: 'open',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: /ai/refs reports every task as open.')
