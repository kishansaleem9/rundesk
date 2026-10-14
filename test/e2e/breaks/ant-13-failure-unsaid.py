# A BOT THE SERVICE GAVE UP ON STILL READS AS JOINING.
# (`commit-log/log-39863ff-1`)
#
# The service's `fatal` — a meeting that does not exist, a host who refused the
# bot — is read as one more step of joining, so the visit says "Joining" for
# ever and nobody learns the meeting went unrecorded.
#
# Reddens: ai-notetaker: "a bot the service gives up on is said to have failed, with the service’s reason"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/recall.ts'
a = "    case 'fatal':\n    case 'recording_permission_denied':\n      return { status: 'failed', detail }\n"
b = "    case 'recording_permission_denied':\n      return { status: 'failed', detail }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('recall.ts: fatal is read as joining.')
