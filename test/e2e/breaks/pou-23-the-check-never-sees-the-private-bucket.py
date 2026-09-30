# THE CHECK NEVER SEES THE PRIVATE BUCKET SERVED (`found-30-sep/public-cdn-url-makes-every-object-public`):
# it reads its object back from the domain and calls the domain safe whatever came back, so a domain on the
# private bucket is used for the pictures and nobody is told.
# It reddens 3 checks, each named below.
# Reddens: private-object-urls: "and the API says, as an error, when it starts, that the domain serves the private bucket to anybody: disconnect it, and give the pictures a bucket of their own"
#   "where the pictures have a bucket of their own but the domain was left on the private one, the API sees it when it starts and sends nobody there: a picture's address is signed, from the pictures' bucket, and still loads"
#   "and says so, as an error: the domain serves the private bucket, and belongs on the pictures' bucket alone"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "      state = res.ok && body.trim() === token ? 'serves-private' : 'private-kept'\n"
b = "      state = res.ok && body.trim() === token && false ? 'serves-private' : 'private-kept'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-23-the-check-never-sees-the-private-bucket: the check always finds the domain safe')
