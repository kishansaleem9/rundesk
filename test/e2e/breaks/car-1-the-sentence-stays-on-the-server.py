# A REFUSED STEP COMES BACK WITH ITS CODE ALONE AGAIN: the sentence stays on the server.
# Reddens: create-ai-results: "a refused step says why, in the sentence the server gives — not its code"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '            reason: result.reason,\n            message: result.message,\n'
b = '            reason: result.reason,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("car-1-the-sentence-stays-on-the-server: applied")
