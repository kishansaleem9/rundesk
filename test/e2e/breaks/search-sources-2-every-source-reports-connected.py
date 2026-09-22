# Every source reports itself connected, whether or not the workspace holds a
# credential for it.
#
# This is the state the whole item replaces, moved one layer inwards. Drive
# federation already returned `[]` for an absent connection; the fix was to let
# the strip SAY the source cannot answer. A registry that claims every source
# can answer restores the old behaviour exactly — the query runs, comes back
# empty, and the person reads "you have no matching files in Gmail", which is
# false.
#
# It is the optimistic default, which is why it is worth a patch: "assume
# connected and let the query tell us" is a sentence that sounds fine, needs no
# scope table, and removes a round trip. The §V2-11 note above this method is
# about a smaller version of the same instinct — reporting a connection as
# usable because a row exists, without asking whether the grant covers the
# query.
#
# REDDENS THREE, AND THEY ARE THE THREE THAT MATTER. The registry check fails
# on Gmail and SharePoint; the notice never renders, because `activeSource`
# claims to be connected; and the connect link that lives inside the notice
# goes with it. The strip and its tabs are untouched, so the failure says "the
# honesty is gone", not "the strip is gone".
#
# Reddens: search-sources: "and a provider with no stored credential reports itself unconnected"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      return { id, provider, connected: scopes !== undefined && grantCoversSource(id, scopes) }"
b = "      return { id, provider, connected: true }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: every federated source now claims it can answer.')
