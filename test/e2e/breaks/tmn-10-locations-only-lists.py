# THE FILTER NARROWS TOO FAR, AND SAYS NOTHING. The Locations search still goes
# to the server, still carries a `types=` filter, still returns rows this run
# made — but only `list`. Spaces and folders are location types the tab is
# named after, and they now come back as "no matches" for containers that plainly
# exist. Every other row in this suite stays green (the rows drawn are still
# this run's, still narrowed, still a server answer), so this patch isolates the
# request row: it proves that row asserts WHICH types were sent rather than
# merely that some `types=` was present.
# Reddens: task-mentions: "and the narrowing went to the SERVER carrying `types=space,folder,list` and this run's own word"
import io

p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """        `/search/${workspaceId}?q=${encodeURIComponent(mentionQuery)}&types=space,folder,list&limit=20`,"""
b = """        `/search/${workspaceId}?q=${encodeURIComponent(mentionQuery)}&types=list&limit=20`,"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the Locations @ section can only ever offer lists — spaces and folders read as absent.")
