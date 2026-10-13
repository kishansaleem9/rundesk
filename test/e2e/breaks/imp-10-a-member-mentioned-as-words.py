# A SLACK MENTION OF A MEMBER HERE IS WORDS: `@Ana`, not a mention that reaches her,
# unless Slack happened to write a label beside the id — which it does not for a plain `<@U1>`.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "by SQL: #general came in as general-slack (the workspace has its own), Ana’s words under Ana at the moment she wrote them, Ben’s under his name, the reply in its thread, Ana mentioned as herself, her 👍 and not Ben’s, #random left out"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/slack-export.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const member = opts.memberOf(id)\n      if (member) {',
     '      const member = opts.memberOf(id)\n      if (member && label) {'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-10-a-member-mentioned-as-words: a member is mentioned as text')
