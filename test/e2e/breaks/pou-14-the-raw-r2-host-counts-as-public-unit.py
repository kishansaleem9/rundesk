# THE RAW R2 API HOST COUNTS AS A PUBLIC DOMAIN (`found-30-sep/public-cdn-url-makes-every-object-public`):
# where `R2_PUBLIC_URL` names `<account>.r2.cloudflarestorage.com`, a picture's address is an unsigned GET on the
# S3 API, which answers it 400 or 403, and every avatar and logo is a broken image.
# Reddens: unit: r2-signed-urls.test.ts "publicObjectUrl signs a picture too where there is no public domain, or the domain is the raw R2 API host"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "    return /r2\\.cloudflarestorage\\.com/i.test(normalized) ? null : normalized\n"
b = "    return normalized\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-14-the-raw-r2-host-counts-as-public-unit: the raw R2 host is taken for a public domain')
