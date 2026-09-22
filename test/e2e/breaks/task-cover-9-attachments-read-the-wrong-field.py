# The Attachments tab reads `contentType` off the attachment rows again — the
# field the API does not return. It answers `mimeType`, so the filter compares
# `undefined` to `image/` for every row, keeps none of them, and the tab draws
# its empty state on every task however many images are on it.
#
# THIS IS THE STATE THE PRODUCT SHIPPED IN, and the tab was asserted to EXIST
# for a day while nothing in it could ever be listed. Frame `03:10` says it
# offers the files already on the task.
#
# PREDICTED TWO: the option is not offered, so nothing can be chosen from it.
# The empty-state check above passes either way — that is its job — and Remove
# below is unaffected.
#
# Reddens: task-cover: "once one is there it is offered, exactly once"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
# THE TYPE GOES WITH IT, or this does not compile. The first version changed
# only the filter and `r.contentType` became a type error — a patch that does
# not build proves nothing, and it is worse than no patch because it reports as
# a confirmation.
a = "type Attachment = { id: string; fileName: string; mimeType?: string | null; storageKey: string; url?: string | null }"
b = "type Attachment = { id: string; fileName: string; contentType?: string | null; storageKey: string; url?: string | null }"
c = "(r.mimeType ?? '').startsWith('image/')"
d = "(r.contentType ?? '').startsWith('image/')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'type anchor occurs {s.count(a)} times, expected exactly 1'
assert s.count(c) == 1, f'filter anchor occurs {s.count(c)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(c, d))
print('cover-image-picker.tsx: the Attachments tab filters on a field the API does not send.')
