# The preference stops being written to `localStorage`, so it lasts until the
# next page load.
#
# Failure mode 3 of the three the suite's header enumerates, in its own words:
# "A view preference that resets on every reload is a control that appears to
# work and does nothing, which is this codebase's most common defect class."
#
# The toggle still works perfectly within the session — `setCollapseEmptyFields`
# still notifies every listener, so both surfaces re-render and the fields go —
# and the whole thing is forgotten on reload. Somebody who collapses the grid
# once has to collapse it again on every task they open, which is how a
# preference becomes a chore.
#
# The write sits inside a try/catch whose comment explains that failing to
# PERSIST is survivable — "the toggle should work for this session even where it
# cannot be remembered for the next one" — which is exactly the reasoning that
# makes deleting the write look harmless. It is harmless per session and
# useless across them.
#
# ONE CHECK, THE RELOAD. Collapsing works, the count is shown, the fields with
# values stay, the Fields tab agrees, and the required field is still visible.
# Only the check that does a full page load fails.
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
