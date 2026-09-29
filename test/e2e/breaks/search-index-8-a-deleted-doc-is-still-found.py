# The index's doc hits are not held to the bin, as they were: nothing removes a
# doc from the index, so a deleted doc is still found
# (found-29-sep/meili-finds-deleted-docs).
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# Reddens: search-index: "a doc deleted is no longer found — found before its delete and not after it, through the index where Meilisearch answers"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "          includeArchived ? undefined : eq(docs.isArchived, false),\n        ))\n      const found"
b = "        ))\n      const found"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: a deleted doc is still found through the index.')
