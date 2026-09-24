# A GUEST MAKES CHANNELS, which ClickUp's guests cannot.
# Reddens: guest-chat-scope: "a guest makes no channel (403, none made) — a member does"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "    if (maker?.role === 'guest') throw new ForbiddenException('Guests cannot create channels')"
b = "    if (maker?.role === 'guest' && data.name === '') throw new ForbiddenException('Guests cannot create channels')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcs-7-guests-make-channels: a guest makes channels')
