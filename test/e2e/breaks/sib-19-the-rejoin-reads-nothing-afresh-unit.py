# A SOCKET OPENED AGAIN ASKS FOR ITS ROOMS AND READS NOTHING AFRESH: what was said in them while it was down, or while
# the server was still letting it in, is never drawn (the task a colleague made just after another tab's sign-in).
# Reddens: unit: realtime.test.ts "the rooms asked for again wait for the server’s answer, and then the page reads afresh what it shows; no rooms, nothing asked"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "  sock.emit('subscribe', { rooms: again }, () => catchUp())\n"
b = "  sock.emit('subscribe', { rooms: again })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-19-the-rejoin-reads-nothing-afresh-unit: the rejoin asks no answer and reads nothing afresh')
