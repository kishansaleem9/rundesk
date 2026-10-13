# A SERVER ON A PRIVATE NETWORK IS REACHED.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "a password the server refuses is said in its words, and a server on a private network nobody named is refused before a password goes to it; neither leaves a mailbox (read by SQL)"
#
# The SSRF guard of a server whoever links a mailbox types. What answers on the private port is
# not IMAP, so the link fails later and in other words.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mail-server.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      throw new MailServerRefused(`${host} is on a private network: Rundesk reaches mail servers on the internet, or those this server's operator names`)\n",
     '      continue\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-5-private-servers-reached: A SERVER ON A PRIVATE NETWORK IS REACHED.')
