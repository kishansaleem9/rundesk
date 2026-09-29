# A TAKEN NAME IS A 500 AGAIN: the unique index's error is not answered.
# Reddens: client-edit: "a name another client has is refused (400, “already exists”), a contact email that is not one is refused (400), and an empty one clears it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clients/clients.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      if ((err as { code?: string })?.code === '23505') throw new BadRequestException('A client with that name already exists')\n"
b = '      void (err as { code?: string })?.code\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cle-3-taken-name-500: a taken name is a 500')
