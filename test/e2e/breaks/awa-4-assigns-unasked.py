# THE SUGGESTION ASSIGNS BY ITSELF: the pick is assigned as soon as it answers, before anybody confirms it.
# Reddens: assign-with-ai-picker: "nothing is assigned until the suggestion is confirmed, and confirming assigns the suggested member"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '  const answer = suggestion.data\n'
b = '  const answer = suggestion.data\n  useEffect(() => { if (answer && answer.ok) onAssign(answer.pick.userId) }, [answer]) // eslint-disable-line react-hooks/exhaustive-deps\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("awa-4-assigns-unasked: applied")
