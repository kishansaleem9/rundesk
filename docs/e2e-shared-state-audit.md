# The e2e suites share one database, and mostly do not know it

66 suites under `test/e2e/` run against a single Postgres, a single API on
`:3011` and a single `apps/web/dist`. Nothing isolates them from each other.
That is a deliberate trade — the suites are worth much more when they exercise
a real running product than when they exercise a mock — but it means every
suite is writing into a world the others can see, and a suite that assumes
otherwise fails for reasons that have nothing to do with the code it is
testing.

This is an audit of where that assumption is made. Every count below was
measured, not estimated.

---

## 1. Position-dependent workspace picks

**46 of 66 suites** select their workspace by index:

```js
const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
```

`workspaces[0]` is whatever the API happened to list first for the shared admin
account. It is not a stable identity. It is a position.

**5 suites** use the helper that exists for exactly this problem —
`pickWorkspace` at `test/e2e/lib/fixture.mjs:64` — which walks the account's
workspaces and returns the first one that actually contains a list, falling
back to the first only if none do. Those five are `a39-dm-tabs`,
`a61-meeting-record`, `list-view-controls`, `ui-sweep` and `video-regression`.

The other 41 are one list-ordering change away from sweeping an empty shell
and reporting it as the product being broken.

### Why the ordering changes

**3 suites create a workspace and never delete it:**

| suite | line | name it creates |
| --- | --- | --- |
| `assign-to-priorities.mjs` | `:95` | `WS <TAG>` |
| `assignee-picker.mjs` | `:87` | `WS <TAG>` |
| `comment-plus-menu.mjs` | `:85` | `WS <TAG>` |

`assign-to-priorities` cleans up the *priorities* it made (`:106`, `:311`).
None of the three removes the workspace. So the shared admin accumulates one
more `WS e2e-*` per run, permanently, and the meaning of `workspaces[0]`
drifts with every sweep.

This is not hypothetical. It is the bug fixed in `5b30bd1`: `save-comment` took
`workspaces[0]` and needed a workspace the PEER account could also see. The
peer belongs only to the original seeded workspace; the admin accumulates
throwaways. Element zero was a *shared* workspace purely by luck of ordering.
The luck held for one CI run and broke the moment a sweep ran the
workspace-creating suites first — surfacing as `peer save 403`, reported
through a check whose words were about privacy, when nothing about privacy was
wrong.

**A failure message that sends the reader to the wrong file is worse than a
bare assertion.**

### The fix, in order of cost

1. Use `pickWorkspace` instead of `workspaces[0]`. Cheap, mechanical, and
   removes the accidental dependency on ordering.
2. Better: have each suite create and tear down its own workspace, and stop
   sharing one at all.
3. At minimum, the three creators should delete what they create.

---

## 2. Global account state, mutated and restored in a `finally`

`comment-recording.mjs:349` switches the **shared admin account** to Urdu:

```js
await A('/users/me', { method: 'PATCH', body: { locale: 'ur' } })
```

and restores it at `:608`, inside a `finally`.

A `finally` is not a guarantee. It does not run when the process is killed —
and the sweep runner kills a suite that exceeds its per-suite timeout. That is
exactly what happened: `comment-recording` was killed, the `finally` never ran,
and the account stayed in Urdu for the rest of the sweep.

**Sixteen later suites then failed**, none of them for a real reason. Every
page after that point rendered right-to-left, which is why `activity-rail`
reported its rail at `x=181` and its panel at `x=537` and concluded they were
"stacked below". Each of those sixteen passes on its own.

The exposure on CI is lower — CI steps are not killed by a per-suite timeout,
so a failing suite still runs its `finally` — but "lower" is not "none", and
the shape of the failure is the worst kind: sixteen red suites, none of which
points at the one that caused it.

**A suite that mutates a shared account is fragile by construction and should
own a dedicated one.** Locale is the instance we found; theme, notification
preferences and the dock appearance are the same class (`panel-collapse.mjs:740`
enumerates them).

---

## 3. 292 inert error handlers

`apiClient` (`test/e2e/lib/fixture.mjs:28-46`) **never throws**:

```js
const res = await fetch(`${base}${route}`, { ... })
...
return { status: res.status, data: json?.data, error: json?.error }
```

A 500, a 403, a 404 — every one of them returns normally. The only way to know
a call failed is to look at `status`.

Which makes this pattern, which appears **292 times across 63 of the 66
suites**, do nothing at all:

```js
await A(`/workspaces/${id}/priorities/${p.id}`, { method: 'DELETE' }).catch(() => {})
```

There is no rejection to catch. The `.catch` is decoration. Worse, it reads as
"this call is allowed to fail", which is precisely the signal that stops a
reader from checking whether it *did*.

Two consequences, both real:

- **Cleanup that silently does not clean up.** A teardown `DELETE` that 404s
  leaves the row behind, and the next run inherits it. Several of the 292 are
  in `finally` blocks.
- **Setup that silently does not set up.** A fixture `POST` that fails leaves
  the suite asserting against a world it never built — and the assertion that
  follows often passes *vacuously*, because "the thing is not there" is
  indistinguishable from "the thing was never created".

The audit process file calls this out under *checks that cannot fail*; this is
where the instances live.

### The fix

Where the call genuinely may fail, assert what is acceptable:

```js
const res = await A(`/...`, { method: 'DELETE' })
if (res.status !== 200 && res.status !== 404) throw new Error(`cleanup failed: ${res.status}`)
```

Where it must succeed, check it. Either way, delete the `.catch`.

---

## 4. Suites that must not run concurrently

There is one Postgres, one API on `:3011` and one `apps/web/dist`. Two suites
in parallel will interleave their fixtures, and the failures will look like
flakes rather than like a collision.

**One runner at a time.** This is not a performance note; it is a correctness
constraint, and it is the reason parallelising the suites has to be solved by
giving each one its own data, not by giving each one its own process.

---

## 5. The tag convention, and why it is the actual answer

The suites that survive a shared database do one thing:

```js
const TAG = `e2e-rail-${Date.now()}`
```

…and then filter everything they assert to rows carrying that tag. A suite that
asserts "the list has 3 rows" is asserting about every other suite's data too.
A suite that asserts "the list has 3 rows **tagged `e2e-rail-1789…`**" is
asserting about its own.

This is the cheapest isolation available and it costs one line. Every new suite
must do it. Retrofitting the existing ones is worth doing in the same pass as
the `pickWorkspace` migration above, since both edits land in the same setup
block.

---

## Summary of what needs doing

| # | finding | scale | cost |
| --- | --- | --- | --- |
| 1 | `workspaces[0]` instead of `pickWorkspace` | 41 suites | mechanical |
| 2 | 3 suites leak a workspace per run | 3 suites | small |
| 3 | shared admin's locale mutated, restored only in `finally` | 1 suite, 16 victims | small |
| 4 | inert `.catch(() => {})` on a client that never throws | 292 sites, 63 suites | mechanical, but needs judgement per site |
| 5 | assertions not narrowed to the suite's own tag | varies | per suite |

None of these is a product defect. All of them are reasons a product defect
will be reported in the wrong place, or hidden.
