# "Connected" goes back to meaning "has a row" rather than "can answer". A grant
# that cannot satisfy the query is reported as live, so the palette draws no
# notice and the empty result reads as the truth about somebody's files.
# Re-anchored 23 September: `listSources` now tells each person whose account a
# grant is (`heldBy`), so the line this patched is two lines now. Same break.
# Re-aimed 12 October: Connected Search split the grant into the person's own
# and the workspace's, each with its own scope test; this drops both. Same break.
#
# Reddens: app-catalogue: "and a SharePoint credential holding only Files.ReadWrite reports itself unconnected"
#   or "and a SharePoint credential that cannot answer the query says the same"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      if (mine && grantCoversSource(id, mine.scopes)) return { id, provider, connected: true, heldBy: 'you' as const, canConnect: true }\n"
b = "      if (mine) return { id, provider, connected: true, heldBy: 'you' as const, canConnect: true }\n"
a2 = '      if (shared && grantCoversSource(id, shared.scopes)) {\n'
b2 = '      if (shared) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(a2, b2))
print('search.service.ts: listSources reports a grant that cannot answer as connected.')
