# A chip keeps the search hit’s id, `task-<id>`, where the server reads an id.
# Reddens: brain-comments-and-decks: "the composer’s "+" offers a task, Doc or location to focus on and a file to upload, each shown as a chip on the next question"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = 'const hitRawId = (h: { id: string; entityType: string }) => (h.id.startsWith(`${h.entityType}-`) ? h.id.slice(h.entityType.length + 1) : h.id)'
b = 'const hitRawId = (h: { id: string; entityType: string }) => h.id'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-20-chips-hold-the-search-id: A chip keeps the search hit’s id, `task-<id>`, where the server reads an id.')
