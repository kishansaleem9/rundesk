# A failed upload stops naming the file, so a four-file task cannot be retried.
# Reddens: attach-on-create: "a failed upload names the file it lost"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "          problems.push(t('quickCreate.attachmentFailedNamed', { name: file.name }))\n"
b = "          problems.push(t('quickCreate.attachmentFailed'))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: A failed upload stops naming the file, so a four-file task cannot be retried.')
