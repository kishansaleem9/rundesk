# CHAT TURNED OFF IS READ AND MADE ANYWAY.
# (`found-14-oct/clickup-chat-unimported`)
# Reddens: clickup-workspace-import: "and Chat turned off is neither read nor made"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const chat = options.chat === 'no' ? [] : await this.chat(source, members, errors)\n",
     '    const chat = await this.chat(source, members, errors)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-37-chat-off-still-read: CHAT TURNED OFF IS READ AND MADE ANYWAY.')
