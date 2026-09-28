# HOVER ACTIONS THAT ARE NOT HOVER ACTIONS. The opacity transition goes, so
# three icons sit permanently on every card. toBeVisible would pass either
# way, which is why the check measures the computed opacity.
# Reddens: task-attachments: "the actions are invisible at rest (opacity 1) and come up on hover (opacity 1)"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """        className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-border bg-card/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100\""""
b = """        className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-border bg-card/95 p-0.5 opacity-100 shadow-sm\""""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the attachment actions are now painted on every card at rest.")
