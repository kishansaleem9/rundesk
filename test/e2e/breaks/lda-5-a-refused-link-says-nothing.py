# A LINK THE SERVER REFUSES SAYS NOTHING AGAIN: the mutation loses its onError.
# Reddens: linked-docs-access: "a link the server refuses says why, in the server’s words"
import io
p = '/home/user/rundesk/apps/web/src/components/task-linked-docs.tsx'
a = "    onError: (err) => said(err, t('taskLinkedDocs.linkFailed')),\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lda-5-a-refused-link-says-nothing: applied")
