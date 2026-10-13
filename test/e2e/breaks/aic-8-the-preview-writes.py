# THE PREVIEW WRITES THE EVENT.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "the Commands tab drafts the event for her to confirm — its title, its time in her own zone, whom it invites — and nothing is in her calendar yet"
#   or "confirmed, the event is in her own Google Calendar at that instant — 10:00 in Karachi, 05:00 UTC — in Room 4, inviting both, Google asked to send the invitations, and the result says where it went"
#
# Executed during the turn, as the chat surface writes a container: it is in the calendar before anybody confirmed, and twice once they do.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        } else {\n          hasMutation = true\n          toolResults.push({\n',
     "        } else {\n          hasMutation = true\n          if (toolUse.name === 'create_calendar_event') {\n            const now = planFromToolCalls([{ name: toolUse.name, input }], { ...planCtx }).actions[0]\n            if (now) await this.executeOne(now, ctx.userId ?? '')\n          }\n          toolResults.push({\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-8-the-preview-writes: the event is written when it is previewed')
