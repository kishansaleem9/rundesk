# AN ADDRESS WITH A SPACE IN IT IS TAKEN.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: unit: comment-email.test.ts "an address is something, an @ and a domain with a dot, lower-cased; a name, a second address or a line break riding in is not one"
#
# What is before the @ may hold anything but an @, so "an a@example.com" passes as an address.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('const ADDRESS = /^[^\\s@<>()",;:\\\\[\\]]+@',
     'const ADDRESS = /^[^@]+@'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-14-a-name-rides-in-unit: AN ADDRESS WITH A SPACE IN IT IS TAKEN.')
