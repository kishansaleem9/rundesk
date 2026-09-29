# THE DOCK POINTED AT A TASK OFFERS THE LIST'S CARDS: the starter surface ignores the task it is pointed at.
# Reddens: brain-entry-points: "and the dock offers the task’s own actions first — Summarize this task, Progress update, Find similar tasks — not the list’s"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "  const starterSurface: 'workspace' | 'list' | 'task' = scope ? 'task' : currentView === 'list' ? 'list' : 'workspace'\n"
b = "  const starterSurface: 'workspace' | 'list' | 'task' = currentView === 'list' ? 'list' : 'workspace'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bep-19-the-dock-offers-the-lists-cards: the task surface is never asked for')
