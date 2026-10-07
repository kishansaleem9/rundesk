# A MAIL ABOUT A TASK THAT NO TYPE NAMES (an assigned comment, a reminder) IS
# SENT WITHOUT ITS THREAD (`resume-defects/resume-8`), so a reply to it finds no task.
#
# Reddens: unit: notifications.service.test.ts "a mail about a task is sent with the thread kept for it, whatever its type; a mail about a chat message with none"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = ("      default:\n"
     "        await this.email.sendActivity({\n"
     "          to: recipient.email,\n"
     "          recipientName: recipient.displayName,\n"
     "          actorName,\n"
     "          title: data.title,\n"
     "          body: data.body,\n"
     "          taskUrl,\n"
     "          workspaceName,\n"
     "          ...threaded,\n")
b = ("      default:\n"
     "        await this.email.sendActivity({\n"
     "          to: recipient.email,\n"
     "          recipientName: recipient.displayName,\n"
     "          actorName,\n"
     "          title: data.title,\n"
     "          body: data.body,\n"
     "          taskUrl,\n"
     "          workspaceName,\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('err-6-an-activity-mail-carries-no-thread-unit: the default mail drops its thread')
