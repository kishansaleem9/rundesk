# SEARCH'S TASK BRANCH ASKS THE SPACE AND THE PROJECT ONLY: a private list's task is found by its words.
# Reddens: private-list-reach: ")]) chk( mSearch.status === 200 && !names(mSearch) && names(aSearch), 'search finds the member nothing of the private list — its task, its comment, its name — and finds the admin them',"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '            // private space they were refused (`workspace-read-access` §8).\n            taskInReachFilter(this.db, workspaceId, userId, isManager),\n'
b = '            // private space they were refused (`workspace-read-access` §8).\n            containerVisibilityFilter(this.db, userId, isManager),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-8-search-stops-at-the-project: applied")
