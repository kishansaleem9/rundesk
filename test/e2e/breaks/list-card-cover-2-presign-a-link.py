# THE BUG TASK ATTACHMENTS STILL HAVE.
#
# A hyperlink is pushed through `getObjectUrl`, which either prefixes the CDN
# host onto `https://…` or presigns a bucket key named after somebody's URL.
# The field is populated, non-empty and plausible; the image is a dead link.
# Only the byte-for-byte comparison can tell.
#
# Reddens list-card-cover: "a linked cover comes back from the list read byte
# for byte" and "the image it draws is the one that was set".
#
# Reddens: list-card-cover: "the image it draws is the one that was set, byte for byte"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """        if (!r.coverStorageKey) {
          coverUrlByTask.set(r.id, r.coverImageUrl ?? null)
          return
        }"""
b = """        const key = r.coverStorageKey ?? r.coverImageUrl
        if (!key) {
          coverUrlByTask.set(r.id, null)
          return
        }"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
s = s.replace(a, b)
a2 = "        const signed = await this.r2.getObjectUrl(r.coverStorageKey).catch(() => null)"
assert s.count(a2) == 1, f'second anchor appears {s.count(a2)} times, expected exactly 1'
s = s.replace(a2, "        const signed = await this.r2.getObjectUrl(key).catch(() => null)")
io.open(p, 'w', encoding='utf-8').write(s)
print('tasks.service.ts: a LINKED cover is now presigned like a storage key, so the URL comes back mangled.')
