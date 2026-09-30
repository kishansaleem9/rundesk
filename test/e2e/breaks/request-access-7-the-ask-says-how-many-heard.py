# THE ASK ANSWERS WITH `notified` AGAIN: the count of people told, which is none for an id naming nothing and some
# for a private task, so the answer says which it was.
# Reddens: request-access: "asking for access to an id that names nothing is answered as asking for a private task, word for word — and tells nobody, where the private task’s ask reaches the admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.controller.ts'
a = "    return { status: out.status === 'already_asked' ? 'already_asked' : 'sent' }\n"
b = '    return out\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-7-the-ask-says-how-many-heard: the ask answers with its count')
