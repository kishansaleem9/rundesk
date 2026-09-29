/*
 * A loopback port nothing is listening on right now, chosen by the OS.
 *
 * The stub gates chose theirs from their process id — `9300 + pid % 400` and
 * `9500 + pid % 300`. The two ranges overlap, and stubs left by ended mutant
 * runs were still listening in them: sixteen, at 9301–9661
 * (`found-29-sep/killed-mutants-outlive-their-run`). A mutant run that drew a
 * taken port saw its stub die on EADDRINUSE, and exited without naming a case:
 * "proves nothing", for a reason that had nothing to do with the rule under
 * test (`found-29-sep/stub-mutants-time-out-unnamed`).
 */
import { createServer } from 'node:net'

export const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
