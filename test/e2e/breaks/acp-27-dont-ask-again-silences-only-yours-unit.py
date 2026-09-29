# "DON'T ASK AGAIN" SILENCES ONLY YOUR OWN OFFER (`ledger-rows/row-850`): muted, and still asked about every colleague you assign.
# Reddens: unit: use-priorities.test.ts "muting the prompt silences the offer for a colleague too"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  if (opts.muted) return false\n"
b = "  if (opts.muted && opts.assigneeId === opts.currentUserId) return false\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-27-dont-ask-again-silences-only-yours-unit: the mute covers your own offer only')
