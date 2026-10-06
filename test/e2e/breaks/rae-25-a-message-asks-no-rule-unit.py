# A NOTIFICATION ABOUT A CHAT MESSAGE ASKS NOT THE CHANNEL (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A notification about a chat message goes only to someone the channel's
# rule lets read it now (a reminder about a message fires long after it was
# set). Let every one through and a person who has lost the channel is sent
# its words.
#
# Reddens: unit: notification-reach.test.ts "a notification about a task asks the task’s read rule, one about a doc the doc’s, and one about a chat message the channel’s, and goes as they answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notification-reach.ts'
a = "  if (target.entityType === 'chat_message') return rules.chatMessage(db, workspaceId, target.entityId, recipient)\n"
b = "  if (target.entityType === 'chat_message') return true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-25-a-message-asks-no-rule-unit: a notification about a chat message asks no rule')
