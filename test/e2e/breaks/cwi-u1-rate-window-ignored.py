# A TOOL THAT SAYS ITS WINDOW IS SPENT IS ASKED AGAIN AT ONCE.
# (`found-14-oct/clickup-chat-unimported`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "waits for the window to start again once the tool says it is spent, and asks nothing before"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-http.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (Number.isFinite(left) && left <= 0 && reset !== null) this.pausedUntil = Math.max(this.pausedUntil, Math.min(reset, Date.now() + MOST_RATE_WAIT_MS))\n',
     '    if (Number.isFinite(left) && left < -1 && reset !== null) this.pausedUntil = Math.max(this.pausedUntil, Math.min(reset, Date.now() + MOST_RATE_WAIT_MS))\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-u1-rate-window-ignored: A TOOL THAT SAYS ITS WINDOW IS SPENT IS ASKED AGAIN AT ONCE.')
