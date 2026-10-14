# A 429 WITH NO RETRY-AFTER IS WAITED OUT A SECOND, NOT UNTIL THE WINDOW STARTS AGAIN.
# (`found-14-oct/clickup-chat-unimported`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "waits a 429 out until the window starts again when it gives no Retry-After, a minute at most, five times"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-http.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (reset !== null) return Math.min(Math.max(reset - Date.now(), 200), MOST_RATE_WAIT_MS)\n',
     '    if (reset === -1) return Math.min(Math.max(reset - Date.now(), 200), MOST_RATE_WAIT_MS)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-u2-429-waited-a-moment: A 429 WITH NO RETRY-AFTER IS WAITED OUT A SECOND, NOT UNTIL THE WINDOW STARTS AGAIN.')
