# LINK IT AGAIN OPENS AN EMPTY FORM: NOT ITS ADDRESS, NOR ITS SERVERS.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "the Email settings name an IMAP mailbox by its servers; Link it again opens its form started from them, the password left blank; a password the server refuses is said in the form, in its words"
import io
p = '/home/user/rundesk/apps/web/src/pages/email-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('              start={{ address: account.address, servers: account.servers }}\n',
     '              start={null}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-w6-linked-again-from-nothing: LINK IT AGAIN OPENS AN EMPTY FORM: NOT ITS ADDRESS, NOR ITS SERVERS.')
