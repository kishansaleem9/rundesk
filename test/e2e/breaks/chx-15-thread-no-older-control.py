# EARLIER REPLIES WITH NO WAY TO THEM: the panel is never handed the pages.
# Reddens: chat-history: "the thread panel shows r130, not r001, with "Load earlier replies" above them"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = '            olderReplies={threadQuery.hasNextPage ? threadQuery : null}\n'
b = '            olderReplies={null}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-15-thread-no-older-control: applied")
