# Only the last staged file is uploaded — the single-file behaviour hiding behind a multi-file list.
# Reddens: attach-on-create: "both staged files are uploaded — not just the last one picked"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "      for (const file of attachments) {\n        try {\n          const contentType = file.type || 'application/octet-stream'\n"
b = "      for (const file of attachments.slice(-1)) {\n        try {\n          const contentType = file.type || 'application/octet-stream'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: Only the last staged file is uploaded — the single-file behaviour hiding behind a multi-file list.')
