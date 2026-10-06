# THE DRIVER IS NOT GIVEN THE READER (`found-5-oct/years-below-100-read-back-wrong`): drizzle's own raw text goes to
# its columns, and every timestamp is read by `new Date` of it.
# Reddens: unit: timestamp-text.test.ts "is the parser every Db handle gives the driver for a timestamp with time zone"
import io
p = '/home/user/rundesk/packages/db/src/client.ts'
a = '  client.options.parsers[TIMESTAMPTZ_OID] = readTimestamptzText\n'
b = '  void [readTimestamptzText, TIMESTAMPTZ_OID]\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ybr-4-the-driver-is-not-told-unit: the driver keeps the raw text')
