# ANY SCHEME IS AN ADDRESS: a `javascript:` or `data:` one is linked, asked of the splitter itself.
# Reddens: unit: link-addresses.test.ts "only http and https are addresses: javascript:, data: and ftp: stay text"
import io
p = '/home/user/rundesk/apps/web/src/lib/link-addresses.ts'
a = 'const ADDRESS = /https?:\\/\\/[^\\s<>"\'`]+/g\n'
b = 'const ADDRESS = /[a-z]+:[^\\s<>"\'`]+/g\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/web/src/lib/link-addresses.ts'
a = '    if (!/^https?:\\/\\/[^/]/.test(href)) continue\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csc-8-any-scheme-is-an-address-unit: link-addresses.ts: any scheme is an address.')
