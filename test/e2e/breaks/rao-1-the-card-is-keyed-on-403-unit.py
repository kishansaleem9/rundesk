# THE CARD IS KEYED ON THE 403 AGAIN, which no read of a task one may not open answers now: it is never drawn.
# Reddens: unit: request-access-offer.test.ts "offers it on the 404 a task the reader may not open shares with an id that names nothing"
import io
p = '/home/user/rundesk/apps/web/src/components/request-access-offer.ts'
a = '  return status === 404\n'
b = '  return status === 403\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rao-1-the-card-is-keyed-on-403-unit: the card is keyed on 403')
