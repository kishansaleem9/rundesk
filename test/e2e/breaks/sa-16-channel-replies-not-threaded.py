# A mention in a channel is answered in the channel, not in the message’s thread.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "mentioned in a channel, it replies in the message’s thread"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(p, encoding='utf-8').read()
a = "        reply: { kind: 'chat', channelId: e.channelId, parentMessageId: e.threadId },"
b = "        reply: { kind: 'chat', channelId: e.channelId, parentMessageId: null },"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-16-channel-replies-not-threaded: A mention in a channel is answered in the channel, not in the message’s thread.')
