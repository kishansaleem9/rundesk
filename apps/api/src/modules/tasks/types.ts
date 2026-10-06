// The shape injected onto the request by JwtStrategy / CurrentUser decorator.
export type CurrentUserPayload = {
  id: string
  email: string
  role: string
  /** The session the request's access token names (`sid`), when it names one. */
  sid?: string
}
