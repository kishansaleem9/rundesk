# The imported doc gets no opening revision.
#
# THE DEFECT THAT FAILS SILENTLY. The endpoint returns the row, the doc is
# really there, every check about its CONTENT passes — and its history begins
# AFTER its content, so the first edit has nothing to diff against. This is the
# state `importDocFromMarkdown` shipped in: `create`, six lines above it in the
# same file, does three follow-ups and the import did none of them.
#
# THIS PATCH ORIGINALLY REMOVED `indexDocInSearch` AND REDDENED NOTHING, which
# is worth recording. `SearchService.search` uses Meilisearch only `if
# (this.enabled && this.index && …)` and otherwise falls back to a database
# query — and no Meilisearch ran in a lane, so the index call had no
# observable effect at all. The check it aimed at passed with the call
# removed, and indexing was recorded as unmeasurable. It is measurable now on
# a lane RUNDESK_LANE_SEARCH names, and `doc-import-5-an-import-is-never-indexed`
# is that patch; this one keeps the revision, which nothing else reddens
# (`commit-log/log-68c0345-1`).
#
# `snapshotRevision` is the follow-up that CAN be broken and observed, through
# `GET /docs/:id/revisions`, so that is what this takes. Only that one: a patch
# removing all three would not say which of them its check is about.
#
# Reddens: doc-import: "and it has an opening revision, so the first edit has something to diff against"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
# THE ANCHOR HAD TO REACH PAST THE BLOCK ITSELF. `createDocFromTemplate` also
# takes a bare `workspaceId`, so its three follow-up lines are textually
# IDENTICAL to the import's and the first anchor matched both. What comes after
# them differs, so the export method below is what tells the two apart — and
# `check-break-patches.py` caught it by requiring exactly one match rather than
# patching whichever came first.
# The anchor reaches past the block: `createDocFromTemplate` also takes a bare
# `workspaceId`, so its follow-up lines are textually identical to the import's
# and a shorter anchor matched both. `check-break-patches.py` refused it rather
# than patching whichever came first.
a = """    await this.snapshotRevision(row, userId)
    this.realtime.emitToWorkspace(workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    void this.indexDocInSearch(row.id)
    return row
  }

  /** Export a doc as a (line-based) PDF. Access-checked. */"""
b = """    this.realtime.emitToWorkspace(workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    void this.indexDocInSearch(row.id)
    return row
  }

  /** Export a doc as a (line-based) PDF. Access-checked. */"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('docs.service.ts: an imported doc gets no opening revision.')
