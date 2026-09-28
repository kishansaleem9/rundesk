# THE PROJECT PAGE HIDES THE FORM FROM A PLAIN MEMBER AND SAYS NOTHING: no note that adding a client is another's.
# Reddens: client-access: "the project page’s Client section offers a plain member no “+ New client name” form, and says adding a client is for those who manage clients"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '            ) : mayAddClient === false ? (\n'
b = '            ) : mayAddClient === false && Boolean(0) ? (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-9-refusal-said-by-nothing: the refusal note is never shown')
