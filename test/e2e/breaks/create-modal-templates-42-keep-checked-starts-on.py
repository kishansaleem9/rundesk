# KEEP CHECKED ITEMS STARTS ON, where ClickUp leaves it for the saver to choose.
# (`found-30-sep/load-template-takes-every-attribute`, batch 19)
# Reddens: create-modal-templates: "Save as template from the task sheet offers ClickUp’s import options: Import everything to begin with, or Customize import items, each of the eight; and Keep checked items, off"
import io
p = '/home/user/rundesk/apps/web/src/components/task-templates-section.tsx'
a = ('      setCustomize(false)\n'
     '      setItems(ALL_IMPORT_ITEMS)\n'
     '      setKeepChecked(false)\n')
b = ('      setCustomize(false)\n'
     '      setItems(ALL_IMPORT_ITEMS)\n'
     '      setKeepChecked(true) // BROKEN: Keep checked items starts on\n')
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-42-keep-checked-starts-on: Keep checked items starts ticked')
