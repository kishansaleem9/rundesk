# FROM OFFERS NO SIGN IN WITH IMAP.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "From’s Link an email offers Sign in with IMAP; its form links the mailbox, From chooses it at once, and Send sends from it over TLS"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-email.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const linkable = (['gmail', 'outlook', 'imap'] as const).filter((p) => providers?.[p]?.available)\n",
     "  const linkable = (['gmail', 'outlook'] as const).filter((p) => providers?.[p]?.available)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-w1-no-imap-in-from: FROM OFFERS NO SIGN IN WITH IMAP.')
