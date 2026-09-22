# Clear filters stops resetting the two created-date fields.
#
# THE REGRESSION THIS HANDLER'S OWN COMMENT DESCRIBES, and the comment survives
# the patch — which is what makes it the stale reason arriving from the other
# direction. Fifteen `set*('')` calls in a row is the kind of block somebody
# dedupes, and the two `createdAfter`/`createdBefore` lines sit under a
# paragraph explaining that five of them were once missed. Removing exactly the
# two the paragraph is about is how that class of defect comes back.
#
# Every other filter still clears. The badge drops from whatever it was to two,
# which is the shape that hid it the first time: the button visibly does
# something, the results visibly change, and the two filters still narrowing
# are the two nobody looks at after pressing Clear.
#
# TWO CHECKS, AND THE SUITE MADE THEM TWO ON PURPOSE. "Clear filters puts the
# count back to zero" reads the badge, which is derived; "and the date field is
# actually empty again" reads the input, which is the state. A build that
# recomputed the badge without clearing the field would pass the first and fail
# the second, and this one fails both — the badge cannot reach zero while the
# fields are set, because the badge is derived from them.
#
# `palette-filters.test.ts` derives both lists from this file and would catch a
# filter added to one and not the other, which is why the DELETION is the
# interesting case rather than an addition: removing a reset removes it from
# both lists at once.
#
# Reddens: command-palette: "Clear filters puts the count back to zero" and
#   "and the date field is actually empty again"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = """              setCreatedAfter('')
              setCreatedBefore('')
              setSpaceFilter('')
"""
b = """              setSpaceFilter('')
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('command-palette.tsx: Clear filters leaves the created-date fields set.')
