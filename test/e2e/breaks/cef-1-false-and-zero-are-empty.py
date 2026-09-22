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
# IT RAN GREEN THE FIRST TIME, AND THE SUITE WAS THE REASON. Every custom
# field in the fixture was `type: 'text'` with a non-empty string in the filled
# one, and the built-in grid has no falsy-but-present case — so nothing on the
# task held `false` or `0`, and a predicate that mishandles exactly those two
# values could not be observed. The unit test saw it (2 pass / 2 fail); the
# browser suite had proven the predicate's OTHER cases and no reader of these.
#
# The fixture now carries a checkbox set to "no" and a number field holding
# zero, with a check for each on the Fields tab. This patch reddens those two,
# and nothing else: the reload check, the count and the required-field check
# do not turn on what counts as empty.
#
# ALSO CAUGHT BY `collapse-empty-fields.test.ts`, 2 pass / 2 fail — the two
# cases the comment exists for have unit assertions of their own. Measured in
# the foreground with nothing else touching the tree.
#
# Reddens: collapse-empty-fields: "a checkbox set to \"no\" stays — false is an answer, not a blank"
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
