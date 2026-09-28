# A SELECT THAT REMEMBERS A VALUE AND CHANGES NOTHING. The chosen mode is
# dropped from the request, so the dropdown moves and the server always does
# the same thing -- the V2-02d defect, in a composer.
# Reddens: task-ai-bar: "asking sends the typed instruction AND the chosen mode to /ai/writing/improve"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                      body: { text: aiPrompt.trim(), mode: aiMode, workspaceId },"""
b = """                      body: { text: aiPrompt.trim(), workspaceId },"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the AI composer no longer sends the chosen mode.")
