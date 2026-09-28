# Folder wearing List's label — the menu still has eight items, each labelled,
# and one of them is wrong. A presence check passes; the per-item check does not.
#
# RE-AIMED, AND THE NEW CLAIM IS A FRAGMENT ON PURPOSE. This claimed "and they are
# the create kinds, in the shared module" — which passes under this patch, because
# making every item read one label changes no KIND. The only failure its run
# reports is the per-kind label check.
#
# That check's sentence is a TEMPLATE — `the ${kind} item reads "${EXPECTED_LABEL
# [kind]}"` — so the rendered form ("the folder item reads \"Folder\"") appears in
# the log and nowhere in the suite, and `check-break-claims.mjs` verifies a claim
# against the SOURCE. The stable literal between the two holes is what both
# checkers can see: it is in the source at that line and in every rendered
# failure, which is the only sentence that satisfies both.
# 28 September: quoted WHOLE now, as the source writes it, `${…}` holes and all,
# because a claim must be the whole check sentence. `check-break-claims.mjs` can
# not confirm it yet: the sentence has 12 literal characters, under the 16 a
# template needs to count as a sentence (`TEMPLATE_MIN_CHARS`).
# Reddens: space-create-menu: "the ${kind} item reads \"${EXPECTED_LABEL[kind]}\""
import io
p='/home/user/rundesk/apps/web/src/lib/create-types.ts'
s=io.open(p,encoding='utf-8').read()
a="labelKey: 'quickCreate.tab.folder'"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"labelKey: 'quickCreate.tab.list'"))
