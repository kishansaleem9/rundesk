# The last group of `UUID_SHAPE` grows one character: `{12}` becomes `{13}`.
#
# Now no real id matches, and the guard that exists to turn away nonsense turns
# away everything. This is the drift the suite's three control checks exist to
# catch, and it is a one-character typo in a regex nobody reads twice — the
# `{12}` and `{13}` are three characters apart in a line of 60.
#
# WHAT IT PROVES. Every "turned away before the database" check above still
# passes under this patch, because a build that answers 400 to every id answers
# 400 to a malformed one too. Without the controls the suite would call that a
# working guard. That is the whole reason they are there, and it is why this
# patch has to leave the first four checks green rather than reddening
# everything: a patch that reddened the whole suite would not tell the controls
# apart from the checks they protect.
#
# One definition, one patch — the file's own comment says a second copy of this
# regex is a second chance to get it subtly different, and this is what subtly
# different costs.
#
# Reddens: malformed-ids: "a well-formed id that matches nothing is not a malformed one"
import io
p = '/home/user/rundesk/apps/api/src/common/validation/uuid.ts'
a = "const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i"
b = "const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{13}$/i"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('uuid.ts: the shape check now rejects every real id as well as the malformed ones.')
