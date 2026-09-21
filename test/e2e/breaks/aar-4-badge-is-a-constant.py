# The facade: every task chip shows the same status word. It demos perfectly, and
# two chips that always agree can never be caught by looking at one of them.
# Reddens: ai-answer-rendering: "and its own status — the two are not the same value"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """      data-ref-status={t.status}
      data-ref-status-category={t.statusCategory}
"""
b = """      data-ref-status="todo"
      data-ref-status-category={t.statusCategory}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: every task chip reports the same status.')
