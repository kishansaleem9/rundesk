# THE PRIORITY FIELD LISTS YOU LAST, AFTER EVERYBODY ELSE.
#
# `found-29-sep/priority-field-adds-to-nobody-else`. ClickUp: "your avatar is
# always displayed on the left". Your own list is the one added to most, and in
# a large workspace the last row is a scroll away.
#
# ONE CHECK: the order offered.
#
# Reddens: assign-to-priorities: "the Priority field offers Personal Priorities by person, yours first, then your colleagues"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  return [...me, ...opts.members.filter((m) => m.userId !== opts.currentUserId)].filter(matches)\n"
b = "  return [...opts.members.filter((m) => m.userId !== opts.currentUserId), ...me].filter(matches)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-36-you-are-not-first: you are listed last')
