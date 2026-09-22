# The panel stops saying that Rundesk does not transcribe calls.
#
# One sentence, and the suite gives it a check of its own: "it says plainly
# that calls are not transcribed." A "Meeting record" panel with a Recording
# link field and a notes box, and no statement of what it does NOT do, reads as
# a product that will transcribe the recording you paste. It will not. The
# person comes back tomorrow for a transcript that was never going to arrive,
# which is the facade this audit keeps removing — except here the facade would
# be built by DELETING something rather than adding it.
#
# It is a line of muted 12px text under a heading, which is the shape of every
# piece of copy anybody removes while tidying a panel.
#
# ONE CHECK. The panel still renders, the record still saves, reloads, reopens
# and clears; the tags, the citations and the deep link are all untouched.
# Only the sentence is gone — and it is the only check in this suite that
# exists to protect a sentence.
#
# Reddens: a61-meeting-record: "it says plainly that calls are not transcribed"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'ai.meetingNoTranscription': 'Rundesk does not transcribe calls. Paste notes or a transcript from wherever the call was recorded.',"
b = "  'ai.meetingNoTranscription': 'Paste notes or a transcript from wherever the call was recorded.',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('catalogs.ts: the panel no longer says that calls are not transcribed.')
