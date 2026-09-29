# ANY STRING IS STORED AS THE CONTACT EMAIL.
# Reddens: client-edit: "a name another client has is refused (400, “already exists”), a contact email that is not one is refused (400), and an empty one clears it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      else if (typeof raw === 'string' && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(raw.trim())) set.contactEmail = raw.trim()\n"
b = "      else if (typeof raw === 'string') set.contactEmail = raw.trim()\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cle-4-any-email: any string is an email')
