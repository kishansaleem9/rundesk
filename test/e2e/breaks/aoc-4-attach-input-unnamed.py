# The attach input loses its name, so the suite's opening gate has nothing to
# wait for. This is the patch that proves the gate is still a gate after it was
# changed from `state:'visible'` to `state:'attached'` — remove the input and
# the suite stops dead, exactly as it should.
# Reddens: attach-on-create: the whole run ("threw: page.waitForSelector" / "ran 0 checks, expected 13")
import io

p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '            data-testid="quick-create-attach"\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the file input is unnamed, so nothing can find it.')
