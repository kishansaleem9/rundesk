/*
 * STOP, BUT LET THE EXPLANATION OUT FIRST.
 *
 * `process.exit()` tears the process down without draining stdout, and writing
 * to a PIPE is asynchronous. Whatever has not reached the reader is lost. Eleven
 * checkers here were already converted to `process.exitCode` for that reason;
 * the ones that remained were the ones that have to STOP mid-file, where
 * `exitCode` alone would let the rest of the file run.
 *
 * MEASURED, not argued, on `check-suite-section-enders.mjs` printing one row per
 * finding over a fixture directory:
 *
 *     redirected to a file      195,296 bytes
 *     piped to `cat`            188,677 bytes   —   6,619 lost
 *     piped to a SLOW reader     65,392 bytes   — 129,904 lost
 *
 * That last number is one 64KB pipe buffer plus change, which is the whole
 * mechanism: everything past the buffer is still queued when `exit` fires. A CI
 * log collector is a slow reader, so this is the case that matters — and the
 * faster the checker, the more it loses.
 *
 * The failure is silent and it inverts the usual instinct: the output that
 * survives is the START, so a truncated run looks like a checker that stopped
 * early rather than one that was cut off, and the exit code is correct
 * throughout. There is nothing in the output to notice.
 *
 * THE SUITES ARE NOT AFFECTED — 123 of them on 23 September — and this is
 * recorded so the question is not re-opened from the grep alone. Every one of them ends in `process.exit()`,
 * which looks like the same bug and is not, for two independent reasons:
 * `wt-break.sh` runs a suite with `> file 2>&1`, and a FILE write in Node is
 * synchronous — there is nothing queued to lose — and the largest suite output
 * on disk is 11.6KB against a 64KB buffer, with none of the 1,094 recorded runs
 * over 60KB (re-measured 23 September). Measured, not assumed; if a suite ever grew past that AND its
 * output were piped, both halves would have to change before it mattered.
 *
 * So: set the code, wait for both streams to drain, then leave. The timer is a
 * backstop for a reader that has gone away entirely — `unref`'d so it cannot
 * hold the process open on its own — because a checker that HANGS instead of
 * truncating would be a worse trade, not a better one.
 */
/*
 * AND IT HAS TO BE AWAITED, BECAUSE IT RETURNS.
 *
 * With nothing queued it exits on the spot. With output still queued — which
 * is exactly when stdout is a PIPE, as CI's is — it schedules the exit and
 * RETURNS, and the file went on running: measured with a script that printed
 * 200KB and called `bail(3)` mid-file, the line after it appeared when piped
 * and not when redirected to a file. Eleven checkers stop mid-file this way,
 * `check-migration-order` inside a helper whose caller then dereferenced the
 * value it had just refused, and could print "Validated …" after failing.
 *
 * So it returns a promise that never settles, and every caller writes
 * `await bail(n)`: execution stops there until the exit happens. The backstop
 * is no longer `unref`'d — with a caller parked on this promise, an event loop
 * that emptied would end the process as an unsettled top-level await (exit 13)
 * rather than with `code`; five seconds is the worst case now, never a hang.
 */
export function bail(code = 1) {
  process.exitCode = code

  const pending = [process.stdout, process.stderr].filter((s) => s.writableLength > 0)
  if (!pending.length) process.exit(code)

  let left = pending.length
  const done = () => {
    if (--left <= 0) process.exit(code)
  }
  // Five seconds is far longer than any drain here needs and far shorter than
  // anyone would wait for a checker. It only fires when the reader is gone.
  setTimeout(() => process.exit(code), 5000)
  /*
   * `write('', cb)` RATHER THAN `once('drain', cb)`, and the difference is a
   * race. Listening for 'drain' after testing `writableLength` misses the event
   * when the stream drains between the two, and then only the five-second
   * backstop ends the process — five seconds added to a checker, at random.
   * An empty write queues BEHIND everything already buffered, so its callback
   * cannot fire before that data is flushed, and there is no window to lose.
   */
  for (const s of pending) s.write('', done)
  return new Promise(() => {})
}
