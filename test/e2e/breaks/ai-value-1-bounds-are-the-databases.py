# The service's bounds on the value benchmark removed, leaving only the CHECK
# constraints migration 0140 put on both columns.
#
# THE BENCHMARK IS STILL REFUSED. `AllExceptionsFilter` maps the 23514 to a 400,
# so a status-only assertion sees no difference at all. What changes is the
# sentence: "Minutes saved per run must be a whole number between 0 and 480"
# becomes "A value failed a database constraint", and somebody typing 100000
# is told that a constraint exists rather than what the ceiling is.
#
# Written after the same shape was found twice — `task-merge` and
# `list-name-taken` — and PREDICTED before it was run: the pattern is a service
# check whose only job is to give a database constraint a human sentence, under
# a check that reads the status.
#
# Reddens: ai-value:
#   "and the refusal names the range, rather than reporting a database constraint"
#   "and that refusal is the service's sentence too"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-value.ts'
a = """    if (!Number.isInteger(minutesSavedPerRun) || minutesSavedPerRun < 0 || minutesSavedPerRun > MAX_MINUTES_PER_RUN) {
      return `Minutes saved per run must be a whole number between 0 and ${MAX_MINUTES_PER_RUN}`
    }
"""
b = """    if (!Number.isInteger(minutesSavedPerRun) || minutesSavedPerRun < 0) {
      return `Minutes saved per run must be a whole number between 0 and ${MAX_MINUTES_PER_RUN}`
    }
"""
a2 = """    if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < 0 || hourlyRateCents > MAX_HOURLY_RATE_CENTS) {
      return 'That hourly rate is outside the range this benchmark accepts'
    }
"""
b2 = """    if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < 0) {
      return 'That hourly rate is outside the range this benchmark accepts'
    }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
assert s.count(a2) == 1, f'second anchor appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(a2, b2))
print('ai-value.ts: only the database bounds the benchmark now.')
