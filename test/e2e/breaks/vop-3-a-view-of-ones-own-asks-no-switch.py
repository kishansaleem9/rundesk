# A VIEW OF ONE'S OWN ASKS NO SWITCH: anybody who reads the list makes one, as they did.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "the member, who only views, sets a time estimate and tracks time — a timer and a logged entry — and is refused a tag and a view of their own in the switches’ words (403), and a title in the level’s; the database holds the estimate and the time and nothing else"
#   or "the guest, who only views, sets a time estimate and tracks time — a timer and a logged entry — and is refused a tag and a view of their own in the switches’ words (403), and a title in the level’s; the database holds the estimate and the time and nothing else"
#   or "then the member is refused a time estimate, a timer and a logged entry in the switches’ words (403), and nothing of them is saved; puts the tag on and takes it off again, the second by the bulk editor; and makes a view of their own, while a view everybody shares is still refused for the level"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    } else {\n      await this.assertMayMakeOwnView(data.listId, actor)\n    }\n',
     "    }\n    void this.assertMayMakeOwnView // BROKEN: a view of one's own asks no switch\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("vop-3-a-view-of-ones-own-asks-no-switch: a view of one's own asks no switch")
