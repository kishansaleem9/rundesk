# "Connected" goes back to meaning "has a row" rather than "can answer". A grant
# that cannot satisfy the query is reported as live, so the palette draws no
# notice and the empty result reads as the truth about somebody's files.
# Re-anchored 23 September: `listSources` now tells each person whose account a
# grant is (`heldBy`), so the line this patched is two lines now. Same break.
#
# Reddens: app-catalogue: "a SharePoint credential holding only Files.ReadWrite
#          reports itself unconnected" and "a SharePoint credential that cannot
#          answer the query says the same"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '      if (!grant || !grantCoversSource(id, grant.scopes)) return { id, provider, connected: false, heldBy: null }\n'
b = '      if (!grant) return { id, provider, connected: false, heldBy: null }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: listSources reports a grant that cannot answer as connected.')
