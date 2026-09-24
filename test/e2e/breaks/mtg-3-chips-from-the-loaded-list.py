# THE CHIPS COME FROM THE LIST THE PAGE LOADED, its newest 200, as they did:
# a tag only an older meeting carries has none.
# Reddens: meeting-tags: "the page offers a chip for a tag only a meeting beyond the newest 200 carries, and choosing it shows that meeting"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
a = '  const { data: allTags = [] } = useMeetingTags(workspaceId)\n'
b = '  const allTags = [...new Set((meetingsQuery.data ?? []).flatMap((m) => m.tags ?? []))]\n  void useMeetingTags\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mtg-3-chips-from-the-loaded-list: the chips come from the loaded list')
