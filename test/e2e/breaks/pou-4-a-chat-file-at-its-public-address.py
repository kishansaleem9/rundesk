# A CHAT FILE IS HANDED OUT AT ITS PERMANENT PUBLIC ADDRESS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# a channel's attachment, on the record and in the channel's messages, is `${R2_PUBLIC_URL}/<key>`, readable by
# anybody once handed it after they leave the channel.
# Reddens: private-object-urls: "a chat file is handed out signed, when it is sent and when the channel is read"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "    return this.r2.configured ? this.r2.getObjectUrl(a.storageKey) : a.storageKey\n"
b = "    return this.r2.configured ? `${process.env.R2_PUBLIC_URL}/${a.storageKey}` : a.storageKey\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-4-a-chat-file-at-its-public-address: chat files are handed out at their public address')
