# The field is created and nothing re-reads the panel, so the new field only
# appears after a reload — and the tasks in the sibling list keep the stale
# list until their own staleTime runs out.
# Reddens: task-field-create — "the panel refetches, so the new field is on screen without a reload"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "      await qc.invalidateQueries({ queryKey: ['custom-fields'] })"
b = "      await Promise.resolve()"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: creating a field no longer invalidates the field-value queries.")
