# THE PRE-FIX STATE, restored in full. SharePoint borrows OneDrive's credential
# again AND the registry goes back to reporting any live row as connected — so a
# workspace with OneDrive linked sees the SharePoint tab claim to be connected
# over a token no code path can query.
#
# Both halves on purpose. Two INDEPENDENT conditions now keep that state out:
# the source has its own provider, and a grant is only "connected" when its
# scope can answer the query. Removing one leaves the other holding the row, and
# a patch that proves nothing is worse than no patch.
#
# Re-anchored 23 September: `listSources` now tells each person whose account a
# grant is (`heldBy`); the second half drops the scope test there. Same break.
#
# Reddens: app-catalogue: "the SharePoint source names its own credential"
#   or "a connected OneDrive no longer makes SharePoint say it is connected"
#   or "and a SharePoint credential holding only Files.ReadWrite reports itself unconnected"
#   or "and a SharePoint credential that cannot answer the query says the same"
import io

a1 = """  'google-drive': 'google-drive',
  gmail: 'gmail',
  sharepoint: 'sharepoint',
}
"""
b1 = """  'google-drive': 'google-drive',
  gmail: 'gmail',
  sharepoint: 'onedrive',
}
"""
p1 = '/home/user/rundesk/apps/api/src/modules/search/sources.ts'
s1 = io.open(p1, encoding='utf-8').read()
assert s1.count(a1) == 1, f'anchor appears {s1.count(a1)} times in {p1}, expected exactly 1'

a2 = '      if (!grant || !grantCoversSource(id, grant.scopes)) return { id, provider, connected: false, heldBy: null }\n'
b2 = '      if (!grant) return { id, provider, connected: false, heldBy: null }\n'
p2 = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s2 = io.open(p2, encoding='utf-8').read()
assert s2.count(a2) == 1, f'anchor appears {s2.count(a2)} times in {p2}, expected exactly 1'

io.open(p1, 'w', encoding='utf-8').write(s1.replace(a1, b1))
io.open(p2, 'w', encoding='utf-8').write(s2.replace(a2, b2))
print('sources.ts + search.service.ts: SharePoint borrows OneDrive and any live row counts.')
