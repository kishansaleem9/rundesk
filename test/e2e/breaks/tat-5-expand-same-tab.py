# EXPAND THAT REPLACES THE TASK. The new-tab target goes, so opening an
# attachment full size navigates away from the task you were reading and
# loses the sheet's state.
# Reddens: task-attachments -- 'Expand opens the same file in a new tab'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                    target="_blank"
                    rel="noreferrer"
                    data-testid="attachment-expand\""""
b = """                    rel="noreferrer"
                    data-testid="attachment-expand\""""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: Expand now opens the attachment in the same tab.")
