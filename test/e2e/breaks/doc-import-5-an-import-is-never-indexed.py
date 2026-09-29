# An imported doc is never written into the search index: the import skips `indexDocInSearch`.
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# WHAT `doc-import-2` WAS FIRST WRITTEN TO BE, and could not be. With no
# Meilisearch on any lane, `SearchService.search` took its Postgres path, the
# import was found there whether or not it was indexed, and removing the call
# reddened NOTHING — so indexing was recorded as unmeasurable and that patch
# was re-aimed at the opening revision (`commit-log/log-68c0345-1`). Where the
# lane searches through `meili-stub.mjs`, a doc comes from the index and from
# nowhere else, so an import that was never indexed is never found, and the
# stub's own record says why. Only the import's call is removed: `create` and
# the template path keep theirs, so the patch says which door it is about.
#
# Reddens: doc-import: "the doc is in what this lane’s search reads — the Meilisearch index, under its title, its text and its workspace, where one answers; the docs table the database search matches, where none does"
#          doc-import: "the search endpoint finds it, so an imported document is reachable again — through the index, with its workspace’s filter, where Meilisearch answers"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
# The anchor reaches past the block: `createDocFromTemplate` also takes a bare
# `workspaceId`, and its three follow-up lines are the import's word for word.
a = """    await this.snapshotRevision(row, userId)
    this.realtime.emitToWorkspace(workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    void this.indexDocInSearch(row.id)
    return row
  }

  /** Export a doc as a (line-based) PDF. Access-checked. */"""
b = """    await this.snapshotRevision(row, userId)
    this.realtime.emitToWorkspace(workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    return row
  }

  /** Export a doc as a (line-based) PDF. Access-checked. */"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('docs.service.ts: an imported doc is not indexed.')
