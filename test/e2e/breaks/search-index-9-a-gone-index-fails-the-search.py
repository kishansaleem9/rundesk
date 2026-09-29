# A Meilisearch that fails fails the search, as it did: only a failed init fell
# back, so an index that stopped under the running API made every plain search
# a 500 (found-29-sep/meili-gone-after-boot-fails-every-search).
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# Reddens: search-index: "a search still answers when the index stops answering — from the database, finding the task by its title; where no index answers, it answers as it always does"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = ").catch((err: unknown) => {\n        this.logger.warn(`Meilisearch search failed, answered from Postgres: ${(err as Error).message}`)\n        return null\n      })\n"
b = ")\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: a failed index search fails the search.')
