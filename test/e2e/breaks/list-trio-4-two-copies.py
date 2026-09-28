# THE DUPLICATED LIST WITH A UI ON IT. Give the panel its own copy of the
# setting: pressing the panel switch still writes through to the real one, so
# the chip moves and the rows change and the first direction looks perfect —
# and pressing the CHIP leaves the panel showing the old answer. Two controls,
# one question, two answers, and only the second direction can see it.
# Reddens: list-customize: "and pressing the toolbar chip moves the panel switch back, which is the other direction"
import io
p = "/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx"
s = io.open(p, encoding='utf-8').read()
pairs = [
    ("  const [showTaskLocations, setShowTaskLocations] = useState(false)",
     "  const [panelClosed, setPanelClosed] = useState(true)\n  const [showTaskLocations, setShowTaskLocations] = useState(false)"),
    ("              showClosed={showClosed}\n              onShowClosed={setShowClosed}",
     "              showClosed={panelClosed}\n              onShowClosed={(n) => { setPanelClosed(n); setShowClosed(n) }}"),
]
for a, b in pairs:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('the panel keeps a private copy of showClosed — it writes through and never reads back.')
