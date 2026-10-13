# An agent’s account follows the tasks it writes on.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "Brain follows nothing it answers on and is never notified"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '    if (account?.isAgent) return false\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-9-agents-follow-tasks: An agent’s account follows the tasks it writes on.')
