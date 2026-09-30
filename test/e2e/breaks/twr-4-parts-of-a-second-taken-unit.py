# AN ESTIMATE IN PARTS OF A SECOND IS TAKEN, and Postgres refuses it in its own words.
#
# Reddens: unit: task-values.test.ts "takes none, nought and whole seconds, and refuses one below nought, parts of a second, past the column, or not a number"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('!Number.isInteger(value) || ',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-4-parts-of-a-second-taken-unit: a fractional estimate passes the rule')
