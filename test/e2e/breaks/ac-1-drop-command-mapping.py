# One of the two task features dropped from the taxonomy.
# Reddens: ai-action-categories: "three `task.generate` and two `command` runs add up to five in Tasks"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
a = "  'command':                'tasks',\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-categories.ts: `command` runs no longer belong to any category.')
