# The other way to "fix" a source that cannot be connected: take the tab away
# and leave the apps behind it. Recorded as a break patch because it is the
# option this row deliberately did NOT take — the transcript enlists Gmail out
# loud at [19:18], so removing the tab removes a requirement.
# Reddens: app-catalogue: "the palette offers a Gmail tab in this workspace"
#
# THE FIRST VERSION OF THIS PATCH DID NOT BUILD, and cost the set a result.
# It deleted 'gmail' from `SEARCH_SOURCES`, which is `as const` and generates
# `SearchSource`. Two Records in the same file are keyed by that union
# (`SOURCE_PROVIDER`, `FEDERATED_ENTITY_TYPES`) and `search.service.ts:431`
# calls `.includes('gmail')` against it, so removing the member turned a
# one-line behaviour change into four type errors and the patch never reached a
# check. A break patch must change what the code DOES, not what it is allowed
# to say: the narrowest honest edit is to withdraw the tab where the tab list
# is produced, leaving the union — and every unrelated call site — intact.
#
# It is the third shape of the same lesson. A patch that cannot find its line
# and a patch that cannot compile are both a check with no baseline, and in a
# long log neither is distinguishable from a check not worth writing.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "    return SEARCH_SOURCES.map((id) => {\n"
b = "    return SEARCH_SOURCES.filter((id) => id !== 'gmail').map((id) => {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: the Gmail tab is withdrawn from the source list rather than made to work.')
