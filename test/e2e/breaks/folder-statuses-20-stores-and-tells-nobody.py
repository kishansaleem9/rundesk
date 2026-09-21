# THE MIRROR DEFECT, exactly. The column is added, the dialog writes it, the
# service reads it back — and then throws the answer away, so every list is
# seeded with its own statuses regardless. `folders.status_scope` would hold
# the right value in Postgres for ever and change nothing anybody sees.
# Reddens: folder-dialog: "a list in a Use Space statuses folder really reads the SPACE's statuses"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = "      if (seeded) scope = 'space'"
b = "      if (seeded) scope = 'list'"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: the scope is read and discarded — stored in Postgres, honoured by nobody.')
