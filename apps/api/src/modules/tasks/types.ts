// The shape injected onto the request by JwtStrategy / CurrentUser decorator.
export type CurrentUserPayload = {
  id: string
  email: string
  role: string
}
