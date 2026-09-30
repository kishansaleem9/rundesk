# A DOMAIN ONCE FOUND SAFE IS TRUSTED FOR GOOD (`found-30-sep/public-cdn-url-makes-every-object-public`):
# a later check that finds the domain serving the private bucket changes nothing, so a domain connected to it
# while the API runs is handed out with every picture until a restart.
# Reddens: unit: r2-public-bucket.test.ts "a later check that finds the private bucket served takes the domain away from the pictures"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '    const was = this.publicDomain\n    this.publicDomain = state\n'
b = "    const was = this.publicDomain\n    this.publicDomain = was === 'private-kept' ? was : state\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-29-a-domain-once-checked-is-trusted-for-good-unit: the state never leaves private-kept')
