# EVERY OBJECT IS HANDED OUT AT ITS PERMANENT PUBLIC ADDRESS AGAIN (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `getObjectUrl` answers `${R2_PUBLIC_URL}/<key>` whenever that is a public domain, as it did, so every private
# object — a task's files and cover, a chat file, a clip, a recording — is readable by anybody once handed it; and
# a picture that is signed because the domain serves the private bucket is sent there after all.
# It reddens 8 checks, each named below.
# Reddens: private-object-urls: "a task's file is handed out signed, for a window, not at its permanent public address — and the signed URL serves it"
#   "and so is its cover, the same file as the task's picture"
#   "a chat file is handed out signed, when it is sent and when the channel is read"
#   "a clip's link plays it through a signed URL, and the library lists it signed — neither is its permanent address"
#   "a call's recording is handed out signed on its meeting"
#   "and no route tells anybody where that domain is: an avatar and a workspace logo are sent to a signed URL, which serves them, not to their address at the domain"
#   "where the pictures have a bucket of their own, a task's file stays in the private bucket and is handed out signed — and read by its key at the public domain, as anybody once handed its URL could, it is not there"
#   "where the pictures have a bucket of their own but the domain was left on the private one, the API sees it when it starts and sends nobody there: a picture's address is signed, from the pictures' bucket, and still loads"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '  async getObjectUrl(key: string, expiresInSeconds = 900): Promise<string> {\n    this.requireConfigured()\n    const cmd = new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key })\n'
b = '  async getObjectUrl(key: string, expiresInSeconds = 900): Promise<string> {\n    this.requireConfigured()\n    const base = this.publicBase()\n    if (base) return `${base}/${key}`\n    const cmd = new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-8-every-object-at-its-public-address: getObjectUrl answers the public address again')
