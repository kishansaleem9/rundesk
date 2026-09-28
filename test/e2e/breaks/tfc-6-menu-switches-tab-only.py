# The `···` menu's Custom Fields row moves to the Fields tab and stops there,
# leaving the reader to find the create control themselves — which is what the
# frame's missing chevron says it should not do.
# Re-aimed 25 September: the line reads the sheet's capabilities now (`task-sheet-offers-refused-edits`).
# Reddens: task-field-create — "and choosing it opens the same create form — it is an action, not a submenu"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                          data-testid="task-menu-custom-fields"
                          onSelect={() => {
                            setActiveTab('fields')
                            setFieldCreateStamp((n) => n + 1)
                          }}"""
b = """                          data-testid="task-menu-custom-fields"
                          onSelect={() => {
                            setActiveTab('fields')
                          }}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the menu's Custom Fields row switches tab without opening the form.")
