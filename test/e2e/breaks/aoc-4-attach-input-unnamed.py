# The attach input loses its name, so the suite's opening gate has nothing to
# wait for. This is the patch that proves the gate is still a gate after it was
# changed from `state:'visible'` to `state:'attached'` — remove the input and
# the suite stops dead, exactly as it should.
# Reddens: attach-on-create: no check sentence, and that is the point — the
#   gate runs BEFORE the first check, so the run throws inside the try block
#   and the EXPECTED_CHECKS guard fails it on 0 of 13. This header used to
#   quote the two lines the run prints instead; a claim checker can only read
#   those as a check the suite does not have, because they are not checks.
#   The suite is still named so coverage can attribute the patch.
import io

p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '            data-testid="quick-create-attach"\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the file input is unnamed, so nothing can find it.')
