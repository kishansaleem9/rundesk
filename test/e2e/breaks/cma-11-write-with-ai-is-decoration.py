# The description's AI control stops calling anything — the dead control, back where it was.
# Reddens: create-menu-ai: "pressing it asks /ai/task/generate, with the typed title as the prompt"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          onClick={() => writeDescription.mutate()}\n'
b = '          onClick={() => { /* decorative */ }}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("quick-create-modal.tsx: The description's AI control stops calling anything — the dead control, back where it was.")
