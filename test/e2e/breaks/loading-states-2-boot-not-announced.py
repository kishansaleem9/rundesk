# The boot skeleton loses `role="status"`, so a screen reader is told nothing
# for the whole of the wait.
#
# The sr-only span inside it stays, which is the whole reason this reads as
# correct: the text "Loading Rundesk…" is still in the DOM, so the wait still
# has words. Without a live region nothing announces them — they sit there
# unread, and the person using a screen reader gets silence on exactly the path
# where the screen is emptiest.
#
# `aria-live="polite"` is left in place too, which is the detail that makes this
# a plausible edit rather than an obvious deletion: a live region needs both,
# and half of one looks like it is doing the job.
#
# The check that catches it is in section 6 — the deep-link path, where React
# has mounted and rendered nothing, so `#boot` is the only thing on screen and
# the only thing that could announce anything. On every other path a React
# skeleton's `aria-busy` would satisfy the same check, which is why this is the
# one place in the suite it can be seen.
#
# Reddens: loading-states: "and the wait is announced to assistive tech"
import io
p = '/home/user/rundesk/apps/web/index.html'
a = '    <div id="boot" role="status" aria-live="polite">\n'
b = '    <div id="boot" aria-live="polite">\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('index.html: the boot skeleton is no longer a live region.')
