# THE CARD SAYS "It exists, but it has not been shared with you" AGAIN — true of a private task, false of an id
# naming nothing, and drawn on both: the words do what the 404 no longer does.
# Reddens: request-access: "and a task that does not exist offers the same card in the same words, so the card says nothing about which it is"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = '  \'requestAccess.body\': "It may have been deleted, or it hasn\'t been shared with you. If it\'s there, we can ask whoever can grant access.",\n'
b = "  'requestAccess.body': 'It exists, but it has not been shared with you. We can let whoever can grant access know you asked.',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-5-the-card-says-it-exists: the card says the task exists')
