# A SOCKET THE SERVER CLOSES AGAIN AT ONCE IS REOPENED AT ONCE (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# A socket is reopened on the browser's session at most once a second. Drop
# that and a socket the server refuses as soon as it opens is asked about and
# reopened as fast as the network answers.
#
# Reddens: unit: realtime.test.ts "a socket the server closes again at once is not reopened more often than once a second"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  if (now() - lastFollowedAt < FOLLOW_AT_MOST_EVERY_MS) return false\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-17-a-server-close-is-followed-at-once-unit: a socket the server closes again is reopened at once')
