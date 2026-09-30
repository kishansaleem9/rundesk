# A COPY CARRIES AN ESTIMATE THE RULE REFUSES, so long as it is not below nought: parts of a second,
# and past what the column holds.
#
# Reddens: unit: task-values.test.ts "carries an estimate the rule takes, and none for one it refuses, so a copy is never refused for what its original holds"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return value === null || value === undefined || breaksEstimateRule(value) ? undefined : (value as number)\n',
     "  return typeof value === 'number' && value >= 0 ? value : undefined\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-22-a-copy-carries-parts-of-a-second-unit: carriedEstimate asks only the sign')
