# THE "+" AND THE MOVE PICKER OFFER WHAT EDIT REACHES, WHICH ADDS NOTHING.
# Reddens: full-edit-levels: "the \"+\" and the Move picker offer the member the Full edit space to add to, and not the space whose default is Edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      return !resolved || spaceLevelReaches(resolved.level, 'admin')"
b = "      return !resolved || spaceLevelReaches(resolved.level, 'edit')"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-7-writable-at-edit: the "+" and the move picker offer what edit reaches, which adds nothing')
