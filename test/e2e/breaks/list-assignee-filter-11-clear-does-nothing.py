# The frame's ✕ on the chosen face is wired to nothing — it is still drawn,
# still hoverable, and pressing it leaves the filter exactly where it was.
# Reddens: "clearing the face restores every row", "and both surfaces know it — no face on the chip, nothing in the select".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "                onSelect('')\n"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                onSelect(current)\n'))
print('[break 11] The ✕ badge is a dead control.')
