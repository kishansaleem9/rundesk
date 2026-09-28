# SAVED MESSAGES ARE SEARCHED BY PATTERN AGAIN.
# Reddens: like-literal: "searching saved messages for “50%” finds the saved message with 50% and not the one with 500"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (q) conditions.push(ilike(chatMessages.body, likeContaining(q)))\n    return this.db\n'
b = '    if (q) conditions.push(ilike(chatMessages.body, `%${q}%`))\n    return this.db\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lik-2-saved-by-pattern: done')
