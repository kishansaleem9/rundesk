# A DIRECT MESSAGE’S HISTORY IS A SECOND CONVERSATION BESIDE THE ONE THEY HAVE.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "the admin’s direct messages come over between the same people: with Ana, its history joins the one they have here; with Nina, invited, it is the admin’s for now, and Nina’s place in it — and in Leads — waits for her"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    let channelId = held.size ? null : await this.existingDm([...here])\n',
     '    let channelId: string | null = held.size ? null : null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-43-dm-history-apart: A DIRECT MESSAGE’S HISTORY IS A SECOND CONVERSATION BESIDE THE ONE THEY HAVE.')
