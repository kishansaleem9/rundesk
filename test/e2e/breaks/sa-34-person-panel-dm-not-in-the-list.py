# THE PERSON PANEL OPENS A DM CHAT DOES NOT HOLD YET: the channel list is not read again
# before the panel goes to the new DM, so Chat finds no such channel and falls back to #general.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "Message on a colleague’s profile panel opens a DM with them"
import io
p = '/home/user/rundesk/apps/web/src/components/person-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = "      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })\n      close()\n"
b = "      close()\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-34-person-panel-dm-not-in-the-list: the panel goes to a DM the channel list does not hold')
