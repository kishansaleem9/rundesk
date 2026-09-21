# Check 4 — the toast's Undo really restores the task. Point the offer at the
# wrong trash type, so the button still appears and its restore 404s.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = """          workspaceId: fallbackWorkspaceId,
          type: 'task',
          id: taskId,"""
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, """          workspaceId: fallbackWorkspaceId,
          type: 'doc',
          id: taskId,"""))
print("BROKE check 4: the Undo toast now calls the doc restore route, so pressing it does nothing")
