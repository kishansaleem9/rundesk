# A CALL'S RECORDING IS HANDED OUT AT ITS PERMANENT PUBLIC ADDRESS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# a meeting's `recordingUrl` for a recording of one of the workspace's calls is `${R2_PUBLIC_URL}/<key>`.
# Reddens: private-object-urls: "a call's recording is handed out signed on its meeting"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = "    return this.r2.getObjectUrl(stored).catch(() => null)\n"
b = "    return `${process.env.R2_PUBLIC_URL}/${stored}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-6-a-recording-at-its-public-address: a meeting recording is handed out at its public address')
