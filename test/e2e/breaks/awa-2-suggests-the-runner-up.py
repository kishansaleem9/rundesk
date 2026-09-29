# THE PICKER SUGGESTS THE RUNNER-UP: the route's second choice shown and offered as its first.
# Reddens: assign-with-ai-picker: "the picker’s ⚡ Assign with AI suggests the member with no open work, by name, with the reason in their own numbers — the suggestion route’s pick"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '  const answer = suggestion.data\n'
b = '  const answer = suggestion.data && suggestion.data.ok && suggestion.data.runnerUp ? { ...suggestion.data, pick: suggestion.data.runnerUp } : suggestion.data\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("awa-2-suggests-the-runner-up: applied")
