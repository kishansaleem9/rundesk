# EVERY REFUSAL OF THE HOOK’S MAKER IS PASSED ON IN THE GATE’S OWN WORDS: the hook no longer says its maker lost the list.
# Reddens: unit: inbound-webhooks.service.test.ts "and its maker’s own refusal in the hook’s words, as before"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = "      if (err instanceof HttpException) throw new ForbiddenException('This webhook’s creator can no longer add tasks to its list')\n"
b = '      if (err instanceof HttpException) throw err\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('iws-2-every-refusal-passed-on-unit: every refusal is passed on')
