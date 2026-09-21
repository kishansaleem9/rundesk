# A view the space does not have, offered anyway. The chip claims a tab, the link
# carries `?view=mindmap`, and the page opens on whatever it falls back to — a
# destination that is not the one the chip named.
# Reddens: ai-answer-rendering: "a view this build does not draw degrades to the list instead of linking to a missing tab"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "    const viewEnabled = !view || list.views.includes(view)"
b = "    const viewEnabled = true"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: every view reference is treated as a tab that exists.')
