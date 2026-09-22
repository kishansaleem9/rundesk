# The menu item computes its own `favorited` instead of reading the hook the
# star reads.
#
# The comment above it names this patch before it was written: "SAME HOOK AS
# THE STAR. `useToggleFavorite` is the one implementation, so the two controls
# cannot disagree about whether this task is pinned — a second `favorited`
# computed here would be the seventh duplicated-state bug in this codebase."
#
# WHAT THE PATCH ACTUALLY DOES, which is smaller than a second `useState` and
# has the same effect on the one thing under test: the label stops consulting
# the state at all and always reads "Add to favorites". The Star icon beside it
# still fills from `isFavorited`, so this is not "the menu lost the state" — it
# is one of the two things in the row reading it and the other not, which is
# the drift a second copy produces on its first divergence.
#
# Named this way rather than as the hardcoded string it is, because the defect
# class is the duplication and the string is only the cheapest way to model it.
#
# The write still happens: `toggleFavorite.mutate` is untouched, so the
# favourite really is created. What breaks is the two controls agreeing, which
# is the only thing a second copy of one fact can break.
#
# ONE CHECK — "and reopening the menu offers to remove it". The star check
# beside it stays GREEN, because the star still reads the hook; that is what
# makes the pair a pair. A patch that broke the hook would redden both and
# prove only that favourites work.
#
# Reddens: task-menu-favorite-archive: "and reopening the menu offers to remove it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                        {isFavorited ? t('favorites.remove') : t('favorites.add')}"
b = "                        {t('favorites.add')}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the menu item always reads "Add to favorites".')
