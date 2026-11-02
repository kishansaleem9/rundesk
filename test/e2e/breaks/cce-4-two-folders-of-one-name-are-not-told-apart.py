# TWO FOLDERS OF ONE NAME, FROM TWO SPACES, MADE AS TWO PROJECTS OF ONE NAME.
# Reddens: clickup-current-export: "each ClickUp Folder is a project in the Space, and the two Client Work Folders say their Space"
import io
p = '/home/user/rundesk/apps/api/src/modules/imports/import-plan.ts'
a = 'name: (sharing.get(f.name.toLowerCase()) ?? 0) > 1 && f.space ?'
b = 'name: false && f.space ?'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-4-two-folders-of-one-name-are-not-told-apart: applied")
