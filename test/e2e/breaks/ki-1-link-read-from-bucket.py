# THE INDEXER READS A LINK OUT OF THE BUCKET, as it did on every pass: "attach
# by link" posts text/url, which the type check accepts as text/*.
# Reddens: unit: knowledge-indexer.test.ts "skips a linked attachment — its key IS the URL, and there is no object to read"
import io
p = "/home/user/rundesk/apps/api/src/modules/ai/knowledge-indexer.service.ts"
a = "      if (isLinkAttachmentKey(a.storageKey)) continue\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ki-1-link-read-from-bucket: applied")
