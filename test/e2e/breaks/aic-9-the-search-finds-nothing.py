# A SEARCH OF THE CONNECTED APPS IS ANSWERED WITHOUT SEARCHING.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "a search of her own connected apps is answered from her Drive, through her own connection — the file listed with its link"
#
# Nothing is asked of her Drive, and the answer is that nothing matched.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const found = await this.search.search(workspaceId, userId, query, 8, { types: [...open] })\n',
     '    const found = open.length < 0 ? await this.search.search(workspaceId, userId, query, 8, { types: [...open] }) : []\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-9-the-search-finds-nothing: the search of the connected apps asks nothing')
