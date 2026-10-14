# ANY LINK IS TAKEN FOR A MEETING.
# (`commit-log/log-39863ff-1`)
#
# A link that is no Zoom, Meet or Teams meeting is sent to the meeting-bot
# service as if it were one, and answered with a visit that cannot happen,
# rather than refused in words where it was pasted.
#
# Reddens: ai-notetaker: "a link that is no Zoom, Meet or Teams meeting is refused in words, and no bot is sent"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "    const platform = meetingPlatformOf(meetingUrl)\n    if (!platform) throw new BadRequestException('Paste a Zoom, Google Meet or Microsoft Teams meeting link')"
b = "    const platform = meetingPlatformOf(meetingUrl) ?? 'zoom'"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notetaker.service.ts: any link is taken for a Zoom meeting.')
