# "Connected" goes back to meaning "has a row" rather than "can answer". A grant
# that cannot satisfy the query is reported as live, so the palette draws no
# notice and the empty result reads as the truth about somebody's files.
# Reddens: app-catalogue: "a SharePoint credential holding only Files.ReadWrite
#          reports itself unconnected" and "a SharePoint credential that cannot
#          answer the query says the same"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      return { id, provider, connected: scopes !== undefined && grantCoversSource(id, scopes) }\n"
b = "      return { id, provider, connected: scopes !== undefined }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: listSources reports a grant that cannot answer as connected.')
