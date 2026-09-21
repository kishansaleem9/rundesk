# A DM row is labelled with the generated channel name — `dm-1a2b3c4d-5e6f7a8b`
# — instead of the person, which is what happens whenever `dmLabel` is ignored.
# Frame `06:25` draws faces and names: `suleman`, `Hamda Tahir — You`.
# Reddens: sidebar-dms "and its row is labelled with the other person, not with the channel row"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "        const label = dmDisplayName(dm, t('chat.directMessage'))\n"
b = "        // BROKEN: the generated channel name leaks through.\n        const label = dm.name ?? t('chat.directMessage')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: DM rows show the generated channel name.')
