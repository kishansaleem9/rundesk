# UNDO LEAVES THE PROJECTS IT MADE: a Folder's project stays in the sidebar, empty, after its tasks went to Trash.
# Reddens: clickup-current-export: "undo puts the import’s tasks in Trash and archives the projects and Lists it made, and leaves the Space’s own container"
import io
p = '/home/user/rundesk/apps/api/src/modules/imports/import-cleanup.service.ts'
a = "    for (const chunk of batches(ids('project'), 500)) {"
b = "    for (const chunk of batches(ids('project'), 500).slice(0, 0)) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-12-undo-leaves-the-projects: applied")
