# A task Brain is pointed at is read whoever asks.
# Reddens: brain-comments-and-decks: "pointing Brain at a task its asker may not read is refused, in the read rule’s own words, before anything is asked"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '        const taskWorkspace = await this.assertTaskReadable(id, reader)\n'
b = "        const taskWorkspace = (await this.resolveTaskWorkspaceId(id)) ?? ''\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-11-focus-unchecked: A task Brain is pointed at is read whoever asks.')
