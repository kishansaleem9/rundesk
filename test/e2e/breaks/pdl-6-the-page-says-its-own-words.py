# THE CHAT PAGE SAYS ITS OWN WORDS FOR A REFUSED "CREATE TASK FROM MESSAGE": the person is not told why.
# Reddens: planner-default-list: "and the chat page says why, in the server’s words, when its Create task is refused — no task made"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = "      setTaskDraft(null)\n      toast.success(t('chat.taskCreatedFromMessage'))\n    },\n    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),\n"
b = "      setTaskDraft(null)\n      toast.success(t('chat.taskCreatedFromMessage'))\n    },\n    onError: () => toast.error(t('chat.couldNotRunCommand')),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-6-the-page-says-its-own-words: the page says its own words')
