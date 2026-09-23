# The API reads the clip out of the bucket and writes it back, instead of copying.
#
# The attachment is right: the right bytes, under the task's prefix, served when
# the task is read. What changed is the traffic. The recording travels from the
# bucket to the API and back again, as a second upload of every clip anybody
# makes a task from. Only the store's request log can tell, which is what the
# check reads: a PUT to the task's prefix with no copy source.
#
# Reddens: clip-created-card: "copied inside the store from the clip the card uploaded — the recording is sent once"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = ("    await this.r2.copyObject(data.storageKey, storageKey, {\n"
     "      contentType,\n"
     "      metadata: { uploadedby: actorId, taskid: taskId },\n"
     "    })\n")
b = ("    await this.r2.putObject(storageKey, await this.r2.getObject(data.storageKey), contentType, {\n"
     "      uploadedby: actorId,\n"
     "      taskid: taskId,\n"
     "    })\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: attachClip downloads and re-uploads the clip.')
