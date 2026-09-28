# THE ONE THE ROW IS ABOUT: Recent Chats back to a HARD SLICE OF FIVE.
# `expanded` is ignored, so the "More" row still renders and still says the
# right number — and pressing it changes nothing. The sixth conversation is
# unreachable from the UI again, exactly as `workspace-sidebar.tsx:2724` had it.
# Reddens: sidebar-sections: "and pressing it reaches every conversation, including the sixth"
#   or "and it folds back to the preview"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const withContent = expanded ? all : all.slice(0, AI_CHATS_PREVIEW)'
b = '  const withContent = all.slice(0, 5)'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: Recent Chats is a hard slice of five again — More renders, and reveals nothing.')
