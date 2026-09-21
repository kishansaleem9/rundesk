# "Stack fields" becomes a one-way switch: it turns on and never off. The
# control still animates, because PanelSwitch draws from `checked`.
# Reddens ONLY: "switching it back off returns the card to the height it was".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "              label={t('list.board.stackFields')}\n              hint={t('list.board.stackFieldsHint')}\n              checked={stackFields}\n              onChange={onStackFields}"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "              label={t('list.board.stackFields')}\n              hint={t('list.board.stackFieldsHint')}\n              checked={stackFields}\n              onChange={() => onStackFields(true)}"))
print('[break 11] Stack fields cannot be switched back off.')
