# THE GUARD SAYS WHY AGAIN, FOR A PRIVATE LIST: 403 "This list is private", for the list and every task in it.
# Reddens: refused-as-missing: "a member refused a private list is told it is not there, and so are its task and its tasks’ listing, each as an id naming nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = '          { userId: user.id, isManager },\n        )\n      ) {\n        throw new NotFoundException(NOT_THERE)\n      }\n'
b = "          { userId: user.id, isManager },\n        )\n      ) {\n        throw new ForbiddenException('This list is private')\n      }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-2-a-private-list-says-it-is-there: the guard refuses a private list with 403')
