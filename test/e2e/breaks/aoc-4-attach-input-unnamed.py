# The attach input loses its testid, so nothing in the page can find it.
#
# THIS USED TO BE A PATCH WHOSE EVIDENCE WAS THE RUN ENDING, and the header said
# so: "no check sentence, and that is the point — the gate runs BEFORE the first
# check, so the run throws and the EXPECTED_CHECKS guard fails it on 0 of 13".
# It was written to prove the opening `waitForSelector` was still a gate after
# its state changed from `visible` to `attached`. What it actually proved is that
# a thirteen-check suite could be made to report nothing at all — and the check
# immediately after that gate asserts the same fact the gate did: the input is
# there, it takes several files, and it sits behind a label a person can press.
#
# So the gate no longer throws, `stage()` is bounded, and this patch reddens
# checks instead of a run. It is still the patch that proves the input is
# load-bearing; it now says which sentences depend on it.
#
# PREDICTED MOST OF THE SUITE, which is honest for a patch that removes the one
# control every section uses: the multiple-files check first, then every row,
# dedupe, removal and upload check that needs a staged file. The exact count is
# read off the run rather than guessed at here.
#
# Reddens: attach-on-create: "the file input accepts several files at once,
#   behind a paperclip a person can press"
import io

p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '            data-testid="quick-create-attach"\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the file input is unnamed, so nothing can find it.')
