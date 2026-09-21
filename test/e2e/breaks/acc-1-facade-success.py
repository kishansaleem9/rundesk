# THE ONE THIS SUITE EXISTS FOR: the tool reports a created list and writes nothing.
# A fabricated id comes back, the model is told "Done, created …", the transcript of
# the conversation stands as evidence, and Postgres has no row.
# Reddens: ai-create-containers: "THE ROW IS IN POSTGRES, under exactly that id and name"
#
# REWRITTEN 21 September, after it BUILD FAILED and was silently counted as
# proven for weeks. It used to insert an early `return { … }` above the real
# work. Two things went wrong and only the first is obvious:
#
#   1. the fabricated object was missing `views`, which `ContainerCreated`
#      requires — a one-field fix;
#   2. THE EARLY RETURN MADE EVERYTHING BELOW IT UNREACHABLE, and TypeScript's
#      control-flow analysis stops narrowing in unreachable code. Eight further
#      errors followed from that alone: `args.kind === 'list'` no longer
#      narrowed the discriminated union, so `args.description` and
#      `args.visibility` "did not exist", and `created` went back to
#      `… | undefined` at every use.
#
# So a patch that returns early does not break one line; it un-types the rest of
# the function. The fabrication goes where the WRITE happens instead — the row
# is invented and `createList` is never called — which leaves every narrowing,
# the try/catch, and the 409 path exactly as they were, and models the defect
# more precisely into the bargain: the service still does all of its work and
# only the row is missing.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """      const row = await this.lists.createList(
        projectId,
        {
          name,
          description: args.kind === 'list' ? args.description : undefined,
          visibility: args.kind === 'list' && args.visibility === 'private' ? 'private' : 'public',
        },
        actorId,
      )
"""
b = """      const row = { id: '00000000-0000-4000-8000-00000000face', name }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: create_list reports a row it never wrote.')
