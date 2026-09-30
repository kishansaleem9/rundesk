# TRY AGAIN NOW DOES NOTHING: the button is drawn with no action. (`found-30-sep/public-pages-read-429-as-gone`)
#
# Reddens: public-pages-busy: "and “Try again now” asks at once, without waiting a minute out"
import io
p = '/home/user/rundesk/apps/web/src/components/public-busy.tsx'
s = io.open(p, encoding='utf-8').read()
a = '<Button variant="outline" onClick={onRetry} data-testid={`${testId}-retry`}>'
b = '<Button variant="outline" onClick={() => undefined} data-testid={`${testId}-retry`}>'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-4-try-again-now-does-nothing: the retry button is inert')
