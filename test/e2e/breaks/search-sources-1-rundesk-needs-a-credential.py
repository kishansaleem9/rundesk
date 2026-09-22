# Our own data stops being treated as always-available: the source that needs
# no credential is reported unconnected like any provider with no stored token.
#
# `listSources` special-cases `provider === null` — "our own data needs no
# credential and is always available" — and this patch is that special case
# ceasing to be one. Written as a flipped boolean rather than as a deleted
# line because deleting it falls through to `live.get(provider)` with a
# `string | null`, which does not compile; the behaviour under test is the
# same either way, and a patch that has to also fix a type error is a patch
# whose failure mode includes the fix.
#
# WHY IT MATTERS MORE THAN IT LOOKS. The suite's comment says it: "A registry
# that reported it unconnected would put the whole product behind a 'connect'
# prompt." Every Rundesk search — tasks, docs, people, the things that have
# nothing to do with federation — would sit behind a notice pointing at
# settings, and nothing in the settings page could clear it, because there is
# no credential to store.
#
# Reddens exactly the one check that asks. Gmail and SharePoint are unconnected
# either way, so the honest-empty half of the suite is untouched.
#
# Reddens: search-sources: "and Rundesk itself is always answerable"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      if (provider === null) return { id, provider, connected: true }"
b = "      if (provider === null) return { id, provider, connected: false }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: Rundesk now reports itself unconnected, like a provider with no token.')
