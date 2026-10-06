# A TIMESTAMP IS READ BACK BY `new Date` OF POSTGRES'S TEXT (`found-5-oct/years-below-100-read-back-wrong`), as
# drizzle reads it: a start held as 0002-10-06 09:00 is answered as 10 February 2006, a due date of 0099 as 1999.
# Reddens: task-values: "a date with a year below 100 is read back as it was written: a start of 0002-10-06 09:00 and a due date of 0099-10-06 09:00 are answered so by the PATCH, POST /tasks, GET /tasks/:id, the list and the timeline, and Postgres holds them so"
#   or "and the task sheet shows that start as 0002-10-06 09:00, the date it holds, not 10 February 2006 or an empty box"
import io
p = '/home/user/rundesk/packages/db/src/client.ts'
a = '  client.options.parsers[TIMESTAMPTZ_OID] = readTimestamptzText\n'
b = '  void [readTimestamptzText, TIMESTAMPTZ_OID]\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-values-41-a-year-below-100-is-read-as-the-1900s: drizzle reads Postgres's text with new Date")
