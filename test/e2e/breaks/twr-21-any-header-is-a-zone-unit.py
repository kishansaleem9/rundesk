# ANY HEADER IS TAKEN AS THE WRITER'S ZONE, a typo or a name no zone has among them.
#
# Reddens: unit: task-values.test.ts "takes the writer’s zone from a header naming one this system knows, and no zone from anything else"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  return typeof zone === 'string' && zone.length <= 64 && isValidTimeZone(zone) ? zone : undefined\n",
     "  return typeof zone === 'string' && zone ? zone : undefined\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-21-any-header-is-a-zone-unit: writerZone takes any string')
