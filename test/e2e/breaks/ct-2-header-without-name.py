# A PANEL HEADED "THREAD". Every other thing about it is right and the one
# fact the frame's header exists to give — whose comment you are reading —
# is gone. In a task with twelve comments that header orients nobody.
# Reddens: comment-thread: "the header reads \"Thread by <name>\""
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'taskDetail.threadBy': 'Thread by {{name}}',"
b = "  'taskDetail.threadBy': 'Thread',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("catalogs.ts: the thread header no longer names whose comment it is.")
