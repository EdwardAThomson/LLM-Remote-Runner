export interface JwtUser {
  sub: string;
  email?: string;
  name?: string;
  scope?: string[];
  [key: string]: unknown;
}
