# The three arrive at the wrong positions. Frame `10:35` reads off / ON / off
# and this build opens ON / off / ON — every switch still works.
# Reddens: "and at the frame’s own positions — stack off, empties shown, columns open".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const [stackFields, setStackFields] = useState(false)\n  const [showEmptyFields, setShowEmptyFields] = useState(true)\n  const [collapseEmptyColumns, setCollapseEmptyColumns] = useState(false)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '  const [stackFields, setStackFields] = useState(true)\n  const [showEmptyFields, setShowEmptyFields] = useState(false)\n  const [collapseEmptyColumns, setCollapseEmptyColumns] = useState(true)'))
print('[break 12] The panel opens at positions the frame does not show.')
