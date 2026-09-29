# ONLY WHAT THE ROWS NAME GOES: the prefixes are not listed, so a clip, which no row names, stays.
# Reddens: workspace-delete-for-good: "and the files it held go from the store with it — a task’s attachment, which its row names, and a clip, which only its prefix does"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '    for (const prefix of stored.prefixes) {\n      try {\n'
b = '    for (const prefix of stored.prefixes.filter(() => Boolean(0))) {\n      try {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-10-prefixes-unread: applied")
