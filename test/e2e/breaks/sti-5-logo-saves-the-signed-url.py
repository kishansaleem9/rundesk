# THE LOGO SAVED AS IT WAS: the fifteen-minute presigned URL.
# Reddens: stable-images: "a workspace logo is saved the same way, and answers with its bytes"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '    const publicUrl = publicImagePath(key)\n'
b = '    const publicUrl = await this.r2.getObjectUrl(key)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sti-5-logo-saves-the-signed-url: applied")
