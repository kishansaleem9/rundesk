# THE SUITE'S PUBLIC DOMAIN SERVES NOTHING UNSIGNED (`found-30-sep/public-cdn-url-makes-every-object-public`):
# its store refuses a GET that carries no signature, so the deployments `private-object-urls` stands up are no
# longer ones whose domain serves every key of its bucket, as an R2 custom domain does. The precondition says so;
# and every check that reads the domain — the API's own check at boot among them, which then finds the domain
# safe — goes red rather than measuring a private bucket as a public one. It reddens 7 checks, each named below.
# Reddens: private-object-urls: "this API's public domain serves any key of its bucket, unsigned, as an R2 custom domain does — the deployment this suite is about"
#   "and the API says, as an error, when it starts, that the domain serves the private bucket to anybody: disconnect it, and give the pictures a bucket of their own"
#   "where the pictures have a bucket of their own, a task's file stays in the private bucket and is handed out signed — and read by its key at the public domain, as anybody once handed its URL could, it is not there"
#   "an avatar and a logo saved while the pictures shared the private bucket are moved into their own when the API starts, and still load at their saved address — from the public domain"
#   "an avatar and a workspace logo uploaded now go to the pictures' bucket, and their saved address sends a viewer to the public domain, unsigned, which serves them — public by design"
#   "where the pictures have a bucket of their own but the domain was left on the private one, the API sees it when it starts and sends nobody there: a picture's address is signed, from the pictures' bucket, and still loads"
#   "and says so, as an error: the domain serves the private bucket, and belongs on the pictures' bucket alone"
import io
p = '/home/user/rundesk/scripts/e2e-lanes/s3-stub.mjs'
a = "  if (req.method === 'GET') {\n    if (!found) return s3Error(res, 404, 'NoSuchKey', `no object at ${key}`)\n"
b = "  if (req.method === 'GET') {\n    if (!url.searchParams.has('X-Amz-Signature')) return s3Error(res, 403, 'AccessDenied', 'unsigned')\n    if (!found) return s3Error(res, 404, 'NoSuchKey', `no object at ${key}`)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-1-the-public-domain-serves-nothing-unsigned: the store refuses every unsigned GET')
