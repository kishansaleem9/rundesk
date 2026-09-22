# Create with AI becomes pressable with nothing in the box, so it would send an empty prompt.
# Reddens: create-menu-ai: "with the box empty the button is not pressable"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          disabled={!text || busy}\n'
b = '          disabled={busy}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: Create with AI becomes pressable with nothing in the box, so it would send an empty prompt.')
