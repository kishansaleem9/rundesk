# A LIVE EDIT APPLIED TO THE NEWEST PAGE ONLY: a message three pages up keeps its old text.
# Reddens: chat-history: "an edit to the oldest message, three pages up, shows live — and a new message lands at the end"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = '    prev ? { ...prev, pages: prev.pages.map((p, i) => ({ ...p, items: edit(p.items, i) })) } : prev,\n'
b = '    prev ? { ...prev, pages: prev.pages.map((p, i) => (i === 0 ? { ...p, items: edit(p.items, i) } : p)) } : prev,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-12-live-edits-newest-page-only: applied")
