# AN OFFSET'S SECONDS ARE DROPPED (`found-5-oct/years-below-100-read-back-wrong`): a session outside UTC prints an
# old date in its local mean time (-07:52:58), and it is read 58 seconds off.
# Reddens: unit: timestamp-text.test.ts "passes what this app writes today through unchanged, and reads every other form Postgres prints as the instant it is"
import io
p = '/home/user/rundesk/packages/db/src/timestamp-text.ts'
a = ' + Number(om ?? 0) * 60 + Number(os ?? 0))\n'
b = ' + Number(om ?? 0) * 60)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ybr-3-the-seconds-of-an-offset-are-dropped-unit: an offset's seconds are dropped")
