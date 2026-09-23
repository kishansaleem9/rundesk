# ASSIGNED COMMENTS AS THEY WERE: mentions, under a label that says "assigned".
# Reddens: inbox-scope: "and its panels list the two replies, and under Assigned Comments the comment assigned to R"
import io
p = '/home/user/rundesk/apps/web/src/lib/reply-types.ts'
a = "export const ASSIGNED_COMMENT_TYPES: ReadonlySet<string> = new Set(['comment_assigned', 'message_assigned'])\n"
b = "export const ASSIGNED_COMMENT_TYPES: ReadonlySet<string> = new Set(['task_mentioned'])\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-21-assigned-comments-are-mentions: applied")
