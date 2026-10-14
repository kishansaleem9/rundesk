# THE TEST ON A RULE’S CARD SAYS IT WOULD ACT WHEN IT WOULD NOT.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "the rule’s card says its conditions, and testing it on the untagged task shows it would not act: the priority holds, the tag does not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-automations-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("data-would-act={test.data.wouldAct ? 'true' : 'false'}",
     "data-would-act={test.data.wouldAct ? 'false' : 'true'}"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-w3-test-says-the-opposite: THE TEST ON A RULE’S CARD SAYS IT WOULD ACT WHEN IT WOULD NOT.')
