# The card stops asking which failure it was and renders on any error at all — a 500, a dropped connection, a
# 403 for something the reader may open — where it belongs only on the 404 a refused or missing task gets.
#
# RE-AIMED (`found-30-sep/private-task-reads-say-403`): this broke the card when it was keyed on the 403, and
# claimed "but a task that does not exist offers nothing to ask for", which inverted when the refusal became the
# 404. The same mistake — keyed on any error — is now held by the web unit test of the card's rule.
# Reddens: unit: request-access-offer.test.ts "does not offer it on a 403, a 400, a server error or a dropped connection"
import io
p = '/home/user/rundesk/apps/web/src/components/request-access-offer.ts'
a = '  return status === 404\n'
b = '  return error != null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-1-card-renders-on-any-error: the card renders on any error')
