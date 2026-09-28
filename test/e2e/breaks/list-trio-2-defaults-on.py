# Open both switches ON. They work perfectly; they just start somewhere the
# frame does not, so every list in the product draws annotations nobody asked
# for and the frame's own picture is the one state you cannot get back to.
# Reddens: list-customize: "and the two new ones start off, which is where the frame draws them"
import io
p = "/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx"
a = "  const [showTaskLocations, setShowTaskLocations] = useState(false)\n  const [showSubtaskParentNames, setShowSubtaskParentNames] = useState(false)"
b = "  const [showTaskLocations, setShowTaskLocations] = useState(true)\n  const [showSubtaskParentNames, setShowSubtaskParentNames] = useState(true)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('both annotations start on — the frame draws both off.')
