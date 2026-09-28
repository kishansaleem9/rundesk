# NARROWING IN THE BROWSER OVER A LIST THE BROWSER HAS NOT GOT. Locations
# stop sending the types filter, so the request comes back with tasks, docs
# and everything else and the section offers them under a Location label.
# The search entity-types file's own header warns about exactly this: an
# unfiltered search is a wrong answer, not an empty one.
# Reddens: task-mentions: "typing `@/` moves to Locations and every row shown (${await locRowsUi.count()}) is one of this run's containers"
#   or "and the narrowing went to the SERVER carrying `types=space,folder,list` and this run's own word"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """        `/search/${workspaceId}?q=${encodeURIComponent(mentionQuery)}&types=space,folder,list&limit=20`,"""
b = """        `/search/${workspaceId}?q=${encodeURIComponent(mentionQuery)}&limit=20`,"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the Locations @ section searches without its type filter.")
