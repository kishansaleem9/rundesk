# A SUBJECT IS WRITTEN AS IT CAME.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: unit: mail-message.test.ts "a subject, a name or a file name not in plain ASCII is encoded, and no header can be split"
#
# Its words are neither encoded nor kept to one line.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mail-message.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const clean = value.replace(/[\\r\\n]+/g, ' ')\n  return /^[\\x20-\\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`",
     '  return value'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-u3-headers-not-encoded: A SUBJECT IS WRITTEN AS IT CAME.')
