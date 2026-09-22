# The preference stops being written to `localStorage`, so it lasts until the
# next page load.
#
# Failure mode 3 of the three the suite's header enumerates, in its own words:
# "A view preference that resets on every reload is a control that appears to
# work and does nothing, which is this codebase's most common defect class."
#
# I WROTE THAT IT STILL WORKS WITHIN THE SESSION. IT DOES NOT, AND THE RUN SAID
# SO. Predicted to redden one check, it reddened four. There is no in-memory
# copy of this flag: `useSyncExternalStore`'s snapshot IS `read()`, which reads
# `localStorage`. Delete the write and the notification fires, every reader
# re-reads, and every reader gets the old value — so the toggle does nothing at
# all, on any surface, immediately. Not a preference that forgets between
# sessions: a control that never worked.
#
# Corrected here rather than quietly, because the sentence was a claim about
# behaviour and the number underneath it disagreed. That is the same reading
# error as a check whose comment describes something the code does not do; the
# only difference is which file it is in.
#
# The write sits inside a try/catch whose comment explains that failing to
# PERSIST is survivable — "the toggle should work for this session even where it
# cannot be remembered for the next one" — which is exactly the reasoning that
# makes deleting the write look harmless. It is harmless per session and
# useless across them.
#
# FOUR CHECKS: the empty fields never go, the count never appears, the reload
# check fails for the same reason, and the Fields tab does not collapse either.
# The checks about fields with values stay green, because nothing is hidden
# from anywhere — which is the tell that separates this from a patch about what
# counts as empty.
#
# Reddens: collapse-empty-fields: "the empty fields are still hidden after a full page load"
import io
p = '/home/user/rundesk/apps/web/src/lib/collapse-empty-fields.ts'
a = """  try {
    window.localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Still notify: the toggle should work for this session even where it
    // cannot be remembered for the next one.
  }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('collapse-empty-fields.ts: the preference is no longer remembered across a reload.')
