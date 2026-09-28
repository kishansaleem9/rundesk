# A GUEST DELETES A SPACE AGAIN, given space.delete by a custom role and Full edit by a share.
# Reddens: container-delete-keys: "a guest granted space.delete is refused deleting a space shared with them at Full edit (403), and it stays — they make a list there, so the level is real"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (params.kind === 'space' && role === 'guest') {\n"
b = "    if (params.kind === 'space' && role === 'guest' && Boolean(0)) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cdk-16-guests-delete-spaces: the guest refusal is gone')
