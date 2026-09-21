# The `···` menu's Custom Fields row moves to the Fields tab and stops there,
# leaving the reader to find the create control themselves — which is what the
# frame's missing chevron says it should not do.
# Reddens: task-field-create — "choosing it opens the same create form"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                        data-testid="task-menu-custom-fields"
                        onSelect={() => {
                          setActiveTab('fields')
                          setFieldCreateStamp((n) => n + 1)
                        }}"""
b = """                        data-testid="task-menu-custom-fields"
                        onSelect={() => {
                          setActiveTab('fields')
                        }}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the menu's Custom Fields row switches tab without opening the form.")
