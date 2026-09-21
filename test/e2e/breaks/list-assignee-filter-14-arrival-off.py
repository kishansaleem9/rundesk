# The three switches arrive OFF. Frame `11:30` draws all three on.
# Reddens: "the three are there, in the frame's order, all three on".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const [assignedViaComments, setAssignedViaComments] = useState(true)\n  const [assignedViaSubtasks, setAssignedViaSubtasks] = useState(true)\n  const [assignedViaChecklists, setAssignedViaChecklists] = useState(true)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '  const [assignedViaComments, setAssignedViaComments] = useState(false)\n  const [assignedViaSubtasks, setAssignedViaSubtasks] = useState(false)\n  const [assignedViaChecklists, setAssignedViaChecklists] = useState(false)'))
print('[break 14] The popover opens with all three switches off.')
