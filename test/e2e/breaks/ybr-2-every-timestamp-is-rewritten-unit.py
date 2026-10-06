# EVERY TIMESTAMP THE DRIVER READS IS REWRITTEN (`found-5-oct/years-below-100-read-back-wrong`): a raw query's
# rows no longer read as they did, though nothing about their dates was wrong.
# Reddens: unit: timestamp-text.test.ts "passes what this app writes today through unchanged, and reads every other form Postgres prints as the instant it is"
import io
p = '/home/user/rundesk/packages/db/src/timestamp-text.ts'
a = '  if (y.length === 4 && year >= 100 && os === undefined && bc === undefined) return text\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ybr-2-every-timestamp-is-rewritten-unit: nothing passes through')
