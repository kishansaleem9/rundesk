# `isEmptyFieldValue` treats every falsy value as empty, so `false` and `0`
# count as blanks.
#
# The function's own comment is the specification: "`false` and `0` are NOT
# empty. An unticked checkbox that has never been touched arrives as null; one
# somebody deliberately set to 'no' arrives as `false`, and hiding that would
# hide an answer. Same for a number field holding zero — zero is a measurement,
# not the absence of one."
#
# `return false` at the end of the chain is the line that makes those two
# survive, and `!value` is the version anybody writes first. It is right about
# null, undefined, empty strings and — by accident — never about the two cases
# the comment is there for. A patch of exactly this shape hides a "Blocked: no"
# and a "Cost: 0" from a page whose point is to show what a task says.
#
# WHAT IT COSTS IN THE SUITE. The checks that count fields with values before
# and after are the ones that fail: this collapse is eating real data, not
# blanks, which is failure mode 1 of the three the suite's header enumerates.
# The reload check and the required-field check stay green, because neither
# turns on what counts as empty.
#
# ALSO CAUGHT BY `collapse-empty-fields.test.ts`, 2 pass / 2 fail — the two
# cases the comment exists for have unit assertions of their own. Measured in
# the foreground with nothing else touching the tree.
#
# Reddens: collapse-empty-fields: "and every field that had a value stays"
import io
p = '/home/user/rundesk/apps/web/src/lib/collapse-empty-fields.ts'
a = """  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
"""
b = """  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return !value
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('collapse-empty-fields.ts: false and 0 now count as empty.')
