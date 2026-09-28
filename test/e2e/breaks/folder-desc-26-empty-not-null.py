# AN EMPTY STRING WHERE NOTHING WAS WRITTEN. `|| null` becomes `?? ''`, so a
# folder created without a description stores `""` — and the edit dialog then
# draws a filled box containing no words, which reads as an answer somebody
# gave. Absent and empty are the same thing to every reader here, and this
# makes a third spelling that only the database can tell apart.
# Reddens: folder-dialog: "and a folder made without one stores nothing, rather than an empty string standing in for an answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "        description: data.description?.trim() || null,"
b = "        description: data.description?.trim() ?? '',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("folders.service.ts: a folder with no description stores '' rather than nothing.")
