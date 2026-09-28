# SEARCH'S COMMENT BRANCH ASKS THE SPACE AND THE PROJECT ONLY: a comment on a private list's task is found.
# Reddens: private-list-reach: ")]) chk( mSearch.status === 200 && !names(mSearch) && names(aSearch), 'search finds the member nothing of the private list — its task, its comment, its name — and finds the admin them',"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '            ilike(taskComments.body, like),\n            taskInReachFilter(this.db, workspaceId, userId, isManager),\n'
b = '            ilike(taskComments.body, like),\n            containerVisibilityFilter(this.db, userId, isManager),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-9-comment-search-stops-at-the-project: applied")
