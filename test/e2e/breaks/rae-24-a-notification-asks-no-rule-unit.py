# A NOTIFICATION IS WRITTEN, SENT AND MAILED WHATEVER ITS RECIPIENT MAY READ (`found-6-oct/an-open-socket-outlives-its-access`).
#
# Before a notification goes out its recipient is asked the read rule of the
# item it is about. Ask nothing and a person whose access ended is told about
# the item on their socket, in their inbox and by mail.
#
# Reddens: unit: notifications.service.test.ts "a notification about an item its recipient may not read now is neither written, sent, mailed nor pushed, and one they may read is all four"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '    if (!(await this.recipientMayRead(data, role))) {\n      return { row: null as any, delivered: false }\n    }\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-24-a-notification-asks-no-rule-unit: a notification asks no read rule')
