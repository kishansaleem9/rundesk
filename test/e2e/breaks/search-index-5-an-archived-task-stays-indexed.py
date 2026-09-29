# An archived task stays in the search index: `deleteTask` (Archive) never calls `removeTask`.
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# The other door to the same state as `search-index-4`: archiving and the Trash
# each call `removeTask` for themselves, so each is its own patch.
#
# Reddens: search-index: "and so is a task archived — out of the index where Meilisearch answers, and out of the search endpoint’s answer either way"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
# Anchored on deleteTask's own comment: the Trash ends in the same call.
a = """    // index fill up with work that had been thrown away.
    void this.search.removeTask(taskId).catch(() => undefined)
"""
b = """    // index fill up with work that had been thrown away.
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: an archived task stays indexed.')
