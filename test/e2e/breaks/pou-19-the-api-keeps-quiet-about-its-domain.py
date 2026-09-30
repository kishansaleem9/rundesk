# THE API KEEPS QUIET ABOUT A DOMAIN THAT SERVES THE PRIVATE BUCKET (`found-30-sep/public-cdn-url-makes-every-object-public`):
# the check finds it and sends nobody there, but says nothing, so nobody is told to disconnect a domain that
# serves every private object to anybody with its key.
# It reddens 2 checks, each named below.
# Reddens: private-object-urls: "and the API says, as an error, when it starts, that the domain serves the private bucket to anybody: disconnect it, and give the pictures a bucket of their own"
#   "and says so, as an error: the domain serves the private bucket, and belongs on the pictures' bucket alone"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "    if (state === 'serves-private') {\n      this.logger.error(\n"
b = "    if (state === 'serves-private') {\n      void String(\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-19-the-api-keeps-quiet-about-its-domain: the exposure is not logged')
