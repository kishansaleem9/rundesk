# The clash check compares names verbatim, so "Marketing" and "marketing" stop
# being the same name. Two lists that read identically in the tree — nobody
# looking at a sidebar can tell which is which — and the refusal still works for
# an exact repeat, so the feature looks present.
#
# Reddens: list-name-taken: "and case does not get around it"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = '          sql`lower(${lists.name}) = lower(${trimmed})`,\n'
b = '          eq(lists.name, trimmed),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: the duplicate-name check is case sensitive again.')
