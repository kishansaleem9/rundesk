# The Fields panel goes back to setting values only — no create control
# anywhere on the task, which is the state the row was opened against.
# Reddens: task-field-create — "frame `15:20` — \"Add fields\" sits under the description with the rest of the action row",
#          "pressing it lands on the Fields tab with the create form already open"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            data-testid="task-add-fields"
            onClick={onAddFields}"""
b = """            data-testid="task-add-fields-DISABLED"
            hidden
            onClick={onAddFields}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the \"Add fields\" control is hidden and renamed out of reach.")
