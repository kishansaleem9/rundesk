# The file input keeps its value, so re-picking a file you removed fires no
# change event and the row never returns.
#
# IT RAN GREEN AGAINST THE SENTENCE THAT DESCRIBES EXACTLY WHAT IT BREAKS, and
# the reason is Playwright rather than the check's wording. "re-picking a file
# that was removed brings its row back" re-picks with `setInputFiles`, which
# sets the files programmatically and dispatches a change event whatever the
# input held before. The defect is a NATIVE picker's behaviour — choose the same
# file twice and the browser fires nothing — and `setInputFiles` goes around it.
# No amount of rewording that check could have caught this.
#
# What IS observable is the input's own value, which is the single line the
# guarantee rests on, so `attach-on-create` asserts it where it lives — the same
# move `scr-3-nginx-caches-the-shell` makes against a vhost header no browser
# context can show you. 13 checks → 14.
#
# PREDICTED ONE. The re-pick check still passes, correctly: with Playwright
# driving, the row really does come back.
#
# Reddens: attach-on-create: "and the picker clears its own input, so choosing a
#   removed file again fires a fresh change"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "              addAttachments(e.target.files)\n              // Clear the input, or picking the SAME file after removing it\n              // fires no change event and the row never comes back.\n              e.target.value = ''\n"
b = '              addAttachments(e.target.files)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The file input keeps its value, so re-picking a file you removed fires no change event and the row never returns.')
