# A GRANT THE PROVIDER REFUSED STAYS CONNECTED.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "a grant Google refuses is said in its words (502), and the mailbox is marked to link again — linked again, it is the same mailbox, connected (read by SQL)"
#
# The mailbox is never marked to link again.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!err.reconnect) return\n',
     '    return\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-14-refused-grant-kept: A GRANT THE PROVIDER REFUSED STAYS CONNECTED.')
