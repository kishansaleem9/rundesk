# A field a formula reads can be renamed, and the formula then draws a dash where
# a number was, with nothing anywhere saying why.
# Reddens: custom-field-types: "renaming a field a formula reads is refused, naming the formula that reads it"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '      if (users.length > 0) {\n'
b = '      if (users.length > 99) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: renaming a referenced field is allowed again.')
