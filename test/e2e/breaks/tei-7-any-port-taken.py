# ANY NUMBER IS A PORT.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "the form is refused field by field, in words: the address, the password, each server and port, and whether SSL is required (400)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mail-server.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null\n",
     "  return typeof n === 'number' && Number.isInteger(n) ? n : null\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-7-any-port-taken: ANY NUMBER IS A PORT.')
