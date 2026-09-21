# A `userId` that does not track the toggle — always sent, on or off.
# Reddens: ai-activity-filters: "nothing has asked the server for one person’s runs yet" / "`userId` is gone from the next thing the page asks for"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = "    if (mineOnly && myUserId) q.set('userId', myUserId)"
b = "    if (myUserId) q.set('userId', myUserId)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: every activity request carries userId, whatever the toggle says.')
