# The imported doc is never put in the search index.
#
# THE DEFECT THAT FAILS SILENTLY. The endpoint returns the row, the doc is
# really there, every check about its CONTENT passes — and nobody can find it
# again, which is most of the reason to import a document. This is the state
# `importDocFromMarkdown` shipped in: `create`, six lines above it in the same
# file, does three follow-ups and the import did none of them.
#
# Only `indexDocInSearch` is removed here. The realtime emit and the opening
# revision are the other two, and a patch that took all three would not say
# which of them the check is about.
#
# Reddens: doc-import: "search finds it — an imported document you cannot find again is most of the point lost"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
# THE ANCHOR HAD TO REACH PAST THE BLOCK ITSELF. `createDocFromTemplate` also
# takes a bare `workspaceId`, so its three follow-up lines are textually
# IDENTICAL to the import's and the first anchor matched both. What comes after
# them differs, so the export method below is what tells the two apart — and
# `check-break-patches.py` caught it by requiring exactly one match rather than
# patching whichever came first.
a = """    void this.indexDocInSearch(row.id)
    return row
  }

  /** Export a doc as a (line-based) PDF. Access-checked. */"""
b = """    return row
  }

  /** Export a doc as a (line-based) PDF. Access-checked. */"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('docs.service.ts: an imported doc never reaches the search index.')
