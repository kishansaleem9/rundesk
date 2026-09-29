# A SWITCH ALWAYS MAKES A ROW: a second switch of a flag is refused by the one-row key, or, where the key is plain, adds a row.
# Reddens: flag-resolution: "the platform’s switch is one row, updated each time — not another row per switch, with the read left to the table’s order"
#   or "a platform switch turning Forms off reaches a workspace that says nothing of its own: the member is told it is off, and its routes answer 404"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (updated.length === 0) {\n'
b = '      if (updated.length === 0 || Boolean(1)) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('flr-4-switch-inserts: a switch always inserts')
