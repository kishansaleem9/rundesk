# The create form sends the estimate in HOURS where the column holds seconds.
#
# `parseEstimate` still does its whole job — it understands `3`, `90m` and
# `1h 30m`, and it returns an object carrying both a seconds figure and the
# hours the person typed. Using `.hours` instead of `.seconds` is a one-word
# change to a line that reads correctly either way, and the field is called
# `timeEstimate` rather than `timeEstimateSeconds`, so nothing at the call site
# says which unit it wants.
#
# The API accepts it, because 3 is a perfectly good number of seconds. The task
# is created, appears in the list, and reports an estimate of three seconds —
# which the sheet renders as `3s` where the person typed three hours. Every
# other field on the form is unaffected, so a review of the diff sees one word
# and a create that works.
#
# THE SUITE ASSERTS THE UNIT RATHER THAN THE PRESENCE, which is the only reason
# this is visible: `the estimate is stored in seconds` compares against
# `3 * 3600` exactly. A check that asked whether an estimate arrived would pass,
# and so would one that asked whether it was a positive number.
#
# One check. It sits inside the block of seven field checks this suite makes
# about the created task, and the other six are untouched.
#
# Reddens: task-depth: "the estimate is stored in seconds"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = """      ...(estimate ? { timeEstimate: estimate.seconds } : {}),
"""
b = """      ...(estimate ? { timeEstimate: estimate.hours } : {}),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the estimate is sent in hours.')
