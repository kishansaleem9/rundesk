# A YEAR BELOW 100 IS HANDED TO drizzle AS POSTGRES PRINTS IT (`found-5-oct/years-below-100-read-back-wrong`),
# asked of `readTimestamptzText` itself: `new Date` then reads 0002 as 2006.
# Reddens: unit: timestamp-text.test.ts "reads a year below 100 as that year, not as 19xx or 20xx"
import io
p = '/home/user/rundesk/packages/db/src/timestamp-text.ts'
a = '  if (y.length === 4 && year >= 100 && os === undefined && bc === undefined) return text\n'
b = '  if (y.length === 4 && year >= 0 && os === undefined && bc === undefined) return text\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ybr-1-two-digit-years-pass-as-they-are-unit: every four-digit year passes through')
