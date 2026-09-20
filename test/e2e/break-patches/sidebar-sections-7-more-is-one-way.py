# Remove the fold-back, so expanding Recent Chats is a one-way trip and the
# preview can never be got back.
# Reddens: sidebar-sections: "and it folds back to the preview"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      {expanded && all.length > AI_CHATS_PREVIEW && (\n'
b = '      {false && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: "Show less" is gone — expanding the section cannot be undone.')
