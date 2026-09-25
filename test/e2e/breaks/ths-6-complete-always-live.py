# The ✓ stays pressable on a task that is already closed, so it rewrites the
# status the task already has and logs a change that did not happen.
# Re-aimed 25 September: the line reads the sheet's capabilities now (`task-sheet-offers-refused-edits`).
# Reddens: task-header-status — "a task on a closed status cannot be marked complete again"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "              disabled={patchTask.isPending || !completeStatus || currentIsClosed || !(caps.edit || caps.progress)}"
b = "              disabled={patchTask.isPending || !completeStatus || !(caps.edit || caps.progress)}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the mark-complete button no longer switches off on an already-closed task.")
