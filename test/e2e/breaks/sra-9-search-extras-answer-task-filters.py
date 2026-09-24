# A TASK FILTER ANSWERED BY CHANNELS, COMMENTS AND CONTAINERS, as it was: none of which has a status.
# Reddens: search-read-access: "a search narrowed by a task filter returns tasks alone, and only tasks the member may open"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '    const extras = like && !hasTaskFilter\n'
b = '    const extras = like\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sra-9-search-extras-answer-task-filters: applied")
