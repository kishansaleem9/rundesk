# THE CHAT PAGE PICKS THE LIST ITSELF AGAIN: the first list of the first project
# of the first space, named to the server, so the default never applies.
# Reddens: planner-default-list: "a chat message made into a task lands in that list too"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = "    }: { messageId: string; assigneeId?: string; dueAt?: string }) =>\n      // The server chooses the list: the person's default for new tasks, as\n      // `/task` does. This picked the first list of the first project of the\n      // first space itself, so that default never applied.\n      api(`/chat/messages/${messageId}/create-task`, {\n        method: 'POST',\n        body: { assigneeId: assigneeId || undefined, dueAt: dueAt || undefined },\n      }),\n"
b = "    }: { messageId: string; assigneeId?: string; dueAt?: string }) => {\n      const spaces = await api<Array<{ id: string }>>(`/spaces/workspace/${workspaceId}`)\n      const projects = await api<Array<{ id: string }>>(`/projects/space/${spaces[0]!.id}`)\n      const lists = await api<Array<{ id: string }>>(`/lists/project/${projects[0]!.id}`)\n      return api(`/chat/messages/${messageId}/create-task`, {\n        method: 'POST',\n        body: { listId: lists[0]!.id, assigneeId: assigneeId || undefined, dueAt: dueAt || undefined },\n      })\n    },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-2-page-picks-the-list: the page picks the first list')
