# WHAT THE SEARCH FOUND IS NOT DRAWN.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "a search of her own connected apps is answered from her Drive, through her own connection — the file listed with its link"
#
# The model was shown her file; the person is shown nothing.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          {(plan.connectedResults ?? []).some((r) => r.hits.length > 0) && (\n',
     '          {(plan.connectedResults ?? []).some((r) => r.hits.length < 0) && (\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-w3-results-not-drawn: the connected search results are not drawn')
