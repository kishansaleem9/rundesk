# Create just dismisses the plan — the facade: a create button that creates nothing.
# Reddens: create-menu-ai: "Create posts once to /ai/command/execute"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '              onClick={() => run.mutate()}\n'
b = '              onClick={() => setPlan(null)}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: Create just dismisses the plan — the facade: a create button that creates nothing.')
