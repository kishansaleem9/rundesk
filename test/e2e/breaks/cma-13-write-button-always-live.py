# The AI writer becomes pressable with no title, so it asks the model to write about nothing.
# Reddens: create-menu-ai: the AI control is dead until the task has a title
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          disabled={!title.trim() || writeDescription.isPending}\n'
b = '          disabled={writeDescription.isPending}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The AI writer becomes pressable with no title, so it asks the model to write about nothing.')
