# A CLASSIFIER OVER A LIST THE WORKSPACE DOES NOT HAVE. Fill with AI sends
# invented type names, so the model answers confidently about types nobody
# defined and the answer can never resolve to one of this workspace's.
# Reddens: task-ai-bar -- 'it asks /ai/task/generate to choose among this workspaces REAL type names'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            customFields: [{ name: FILL_FIELD, type: 'dropdown', options: types.map((tt) => tt.name) }],"""
b = """            customFields: [{ name: FILL_FIELD, type: 'dropdown', options: ['Bug', 'Chore', 'Epic'] }],"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: Fill with AI now classifies over invented type names.")
