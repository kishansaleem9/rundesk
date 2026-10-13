# THE PREVIEW DRAWS NO EMAIL.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "an email is drafted for her to confirm — whom it goes to and is copied to, its subject and words — and nothing is in her mailbox yet"
#
# Whom it goes to, its subject and words are not shown before it is saved.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (action.tool === 'draft_email') {\n    const cc = asList(a.cc)\n",
     "  if (action.tool === 'draft_email' && action.tool !== 'draft_email') {\n    const cc = asList(a.cc)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-w2-no-draft-drawn: the email is not drawn in the preview')
