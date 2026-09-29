# An edit of a task's title is not written through to the search index.
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# The index keeps the title the task was made with: searching the new title
# finds nothing, and the old one still finds the task under a name it no
# longer has. The Postgres path reads the row itself and cannot tell.
#
# Reddens: search-index: "an edit is written through: the task is found by its new title and no longer by its old one — its document in the index replaced, where Meilisearch answers"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if ('title' in patch || 'description' in patch) void this.indexTaskInSearch(taskId)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: an edit is not re-indexed.')
