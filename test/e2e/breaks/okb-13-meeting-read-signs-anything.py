# THE READ SIDE AS IT WAS: any key in the column signed.
# Reddens: object-key-boundaries: "a meeting whose stored pointer is another workspace’s key, or a script, hands out no link — while a call recording of its own does"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = '    if (!isWorkspaceCallRecordingKey(stored, workspaceId)) return null\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-13-meeting-read-signs-anything: applied")
