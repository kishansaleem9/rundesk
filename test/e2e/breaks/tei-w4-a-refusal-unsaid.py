# A REFUSED LINK SAYS NOTHING IN THE FORM.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "the Email settings name an IMAP mailbox by its servers; Link it again opens its form started from them, the password left blank; a password the server refuses is said in the form, in its words"
import io
p = '/home/user/rundesk/apps/web/src/components/imap-link-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    onError: (err) => setRefusal(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)),\n',
     '    onError: () => setRefusal(null),\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-w4-a-refusal-unsaid: A REFUSED LINK SAYS NOTHING IN THE FORM.')
