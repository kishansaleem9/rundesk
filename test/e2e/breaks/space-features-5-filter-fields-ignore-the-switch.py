# The filter panel offers every field, including the ones the space switched
# off.
#
# `hiddenFields` becomes empty, so a person in a space with Priority and Tags
# turned off can still build a rule narrowing the list by them. The comment
# above this prop says what that reads as: it lets somebody "narrow the list by
# something nothing on it displays, which reads as 'the list is broken' rather
# than 'that is filtered'." A list emptied by a filter on an invisible field is
# a list with no visible explanation for being empty.
#
# `hiddenFields={[]}` is the shape of the edit somebody makes while debugging
# "why is Priority missing from the filter panel" and then forgets to undo. It
# typechecks, it renders, and the only thing that notices is a space that
# switched something off.
#
# REDDENS TWO, ONE PER FIELD, which is the reason both are checked rather than
# one standing for the pair. They come through the same prop but from two
# separate ternaries, and a patch that dropped only `tags` would redden only
# the second.
#
# Reddens: space-features: "Priority is gone from the filter fields"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """              hiddenFields={[
                ...(spaceFeatures.priority ? [] : ['priority']),
                ...(spaceFeatures.tags ? [] : ['tags']),
              ]}
"""
b = """              hiddenFields={[]}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the filter panel offers fields the space has switched off.')
