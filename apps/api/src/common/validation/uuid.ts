/**
 * Is this string shaped like one of our ids?
 *
 * Every id in this schema is a `uuid` column, and Postgres does not treat a
 * non-UUID as a value that simply matches nothing — it refuses the query and
 * returns an error instead of an answer. So a route that passes an unchecked
 * id straight into a `where` clause turns a bad request into a database
 * failure, which reaches the caller as the wrong kind of error and fills the
 * server log with `invalid input syntax for type uuid`.
 *
 * Both of those were happening in CI: `"dashboards"`, from a URL that fell
 * through to a route it never meant to match, and `"null"`, from a client that
 * interpolated a missing id into a query string.
 *
 * One definition, because a second copy of this regex is a second chance to get
 * it subtly different.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: string): boolean => UUID_SHAPE.test(value)
