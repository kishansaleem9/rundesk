# The chips are shown and cleared, and never sent.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "sent, the question carries what the chips held, says so on itself, and the chips are cleared"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '          ...(focusNow.length ? { focus: focusNow.map((f) => ({ kind: f.kind, id: f.id })) } : {}),\n          ...(filesNow.length ? { files: filesNow.map((f) => ({ name: f.name, data: f.data })) } : {}),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-21-chips-never-sent: The chips are shown and cleared, and never sent.')
