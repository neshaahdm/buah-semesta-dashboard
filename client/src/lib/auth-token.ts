// In-memory auth token store — avoids sessionStorage/localStorage restrictions
// Token persists for the lifetime of the browser tab session
let _token: string | null = null;

export function getAuthToken(): string | null {
  return _token;
}

export function setAuthToken(token: string): void {
  _token = token;
}

export function clearAuthToken(): void {
  _token = null;
}
