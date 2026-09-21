# The picker lists names without avatars — which is the row's whole
# complaint, moved from a `<select>` into a panel.
# Reddens: "a person's row draws a real avatar".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                <span data-testid="list-assignee-face" data-for={o.value}>\n                  <PersonAvatar name={o.label} size="xs" />\n                </span>'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                <span data-testid="list-assignee-face" data-for={o.value} />'))
print('[break 9] The picker draws no faces, only names.')
