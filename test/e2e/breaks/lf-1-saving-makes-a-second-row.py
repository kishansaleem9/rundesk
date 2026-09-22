# Saving under a name you already used inserts a second row instead of
# replacing the first.
#
# `onConflictDoUpdate` becomes `onConflictDoNothing`, which is the change that
# looks like a fix for an insert that occasionally errors and quietly changes
# what the word "save" means. The method's own comment is the specification:
# "Saving under a name you already used replaces it — that is what 'save'
# means."
#
# Note what `onConflictDoNothing` does here rather than what it sounds like. The
# unique index is (list, user, name), so the second save is DROPPED: it returns
# no row, the caller gets `undefined`, and the person's edited rules are thrown
# away while the panel reports success. Two filters by one name is the shape the
# check describes; nothing-happened is the shape the database actually produces,
# and both fail the same two checks for different reasons — which is the honest
# answer, because a caller cannot tell them apart either.
#
# IT REDDENED ONE, NOT TWO, AND THAT FOUND A GAP. "the same row is updated, not
# a second one made" failed on the missing id. "So there is still exactly one
# filter by that name" PASSED — correctly: the insert was dropped, so there IS
# one row. The count check cannot tell "replaced" from "second save silently
# discarded", and the id check only tripped by accident, because `returning()`
# gives nothing for a dropped insert. An upsert that kept the id and forgot to
# `set` the rules would have passed both.
#
# So the suite now reads the stored rules back after the second save. "Replaces
# it" is a claim about CONTENTS, and this patch reddens that check too.
#
# Reddens: list-filters: "the same row is updated, not a second one made"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/list-filters.service.ts'
a = """      .onConflictDoUpdate({
        target: [listFilterPresets.listId, listFilterPresets.userId, listFilterPresets.name],
        set: { rules: assertRules(rules), updatedAt: new Date() },
      })
"""
b = """      .onConflictDoNothing()
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list-filters.service.ts: re-saving a named filter no longer replaces it.')
