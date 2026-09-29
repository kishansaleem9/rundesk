# NOTIFICATIONS OFFER NO DIGEST PREVIEW AGAIN.
# Reddens: routes-with-readers: "Preview the digest shows what the digest would hold now — the same total the digest route answers"
import io
p = '/home/user/rundesk/apps/web/src/components/push-notifications-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              <DigestPreview frequency={digestFrequency} />\n'
b = '              {null}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rwr-5-no-digest-preview: no digest preview')
