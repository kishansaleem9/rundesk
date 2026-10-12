# An empty REQUIRED custom field is collapsed away with the rest.
#
# `!definition.isRequired &&` goes from `isHideable`, and the comment above it
# says what that one clause is for: "Required fields are never hidden. An empty
# required field is the one thing on this panel somebody needs to see."
#
# It is the blank that means something. Every other empty field says "nobody
# filled this in"; a required one says "this task is not finished", and hiding
# it makes an unfinished task look complete to the one person who could
# complete it. The field is still required, the server still refuses whatever
# refuses it, and the only surface that would have told anybody has gone quiet.
#
# The clause looks like a special case bolted onto a predicate about emptiness,
# which is precisely what it is — and why a reader tidying `isHideable` down to
# "is this value empty" would take it.
#
# ONE CHECK. The optional empty field is still hidden, the field with a value
# is still listed, the Overview grid is untouched, the count is right about the
# fields it counts. Only the required blank disappears.
#
# Reddens: collapse-empty-fields: "and the empty REQUIRED field is not hidden"
#
# Re-aimed 12 October: a Button field is never collapsed either (it holds no
# value), so the clause sits after that one now. Same break.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "    definition.type !== 'button' && !definition.isRequired && isEmptyFieldValue(value)"
b = "    definition.type !== 'button' && isEmptyFieldValue(value)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: an empty required field is now collapsed like any other.')
