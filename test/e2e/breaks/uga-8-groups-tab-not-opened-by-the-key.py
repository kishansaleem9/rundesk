# SETTINGS OPENS ITS GROUPS TAB TO ADMINS ALONE, AS IT DID: the member granted groups.manage is sent away from it.
# Reddens: user-group-access: "Settings opens its Groups tab to the member granted groups.manage, with the new-group field and the groups listed — and sends the manager, asking for it, to a tab of theirs with no Groups tab in the rail"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  groups: ['groups.manage'],\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-8-groups-tab-not-opened-by-the-key: TAB_KEYS has no groups entry')
