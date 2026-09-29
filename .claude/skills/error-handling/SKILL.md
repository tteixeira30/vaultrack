---
name: error-handling
description: Patterns for robust error handling in Java/Spring Boot (the Tracky backend), TypeScript/React, Python and Go. Covers ResponseStatusException and the api.js error contract, typed errors, degrade-safe external calls, schedulers, transactions, retries and user-facing messages. Use when designing error handling, validation errors, retries, fallbacks or user-facing failure messages.
metadata:
  origin: ECC
---

# Error Handling Patterns

Consistent, robust error handling patterns for production applications.

## When to Activate

- Designing error types or exception hierarchies for a new module or service
- Adding retry logic or circuit breakers for unreliable external dependencies
- Reviewing API endpoints for missing error handling
- Implementing user-facing error messages and feedback
- Debugging cascading failures or silent error swallowing

## Core Principles

1. **Fail fast and loudly** — surface errors at the boundary where they occur; don't bury them
2. **Typed errors over string messages** — errors are first-class values with structure
3. **User messages ≠ developer messages** — show friendly text to users, log full context server-side
4. **Never swallow errors silently** — every `catch` block must either handle, re-throw, or log
5. **Errors are part of your API contract** — document every error code a client may receive

## TypeScript / JavaScript

### Typed Error Classes

```typescript
// Define an error hierarchy for your domain
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
    // Maintain correct prototype chain in transpiled ES5 JavaScript.
    // Required for `instanceof` checks (e.g., `error instanceof NotFoundError`)
    // to work correctly when extending the built-in Error class.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: { field: string; message: string }[]) {
    super(message, 'VALIDATION_ERROR', 422, details)
  }
}

export class UnauthorizedError extends AppError {
  constructor(reason = 'Authentication required') {
    super(reason, 'UNAUTHORIZED', 401)
  }
}

export class RateLimitError extends AppError {
  constructor(public readonly retryAfterMs: number) {
    super('Rate limit exceeded', 'RATE_LIMITED', 429)
  }
}
```

### Result Pattern (no-throw style)

For operations where failure is expected and common (parsing, external calls):

```typescript
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

// Usage
async function fetchUser(id: string): Promise<Result<User>> {
  try {
    const user = await db.users.findUnique({ where: { id } })
    if (!user) return err(new NotFoundError('User', id))
    return ok(user)
  } catch (e) {
    return err(new AppError('Database error', 'DB_ERROR'))
  }
}

const result = await fetchUser('abc-123')
if (!result.ok) {
  // TypeScript knows result.error here
  logger.error('Failed to fetch user', { error: result.error })
  return
}
// TypeScript knows result.value here
console.log(result.value.email)
```

### API Error Handler (Next.js / Express)

```typescript
import { NextRequest, NextResponse } from 'next/server'

function handleApiError(error: unknown): NextResponse {
  // Known application error
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.statusCode },
    )
  }

  // Zod validation error
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues.map(i => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      },
      { status: 422 },
    )
  }

  // Unexpected error — log details, return generic message
  console.error('Unexpected error:', error)
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    { status: 500 },
  )
}

export async function POST(req: NextRequest) {
  try {
    // ... handler logic
  } catch (error) {
    return handleApiError(error)
  }
}
```

### React Error Boundary

```typescript
import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  fallback: ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info)
    console.error('Unhandled React error:', error, info)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

// Usage
<ErrorBoundary fallback={<p>Something went wrong. Please refresh.</p>}>
  <MyComponent />
</ErrorBoundary>
```

## Python

### Custom Exception Hierarchy

```python
class AppError(Exception):
    """Base application error."""
    def __init__(self, message: str, code: str, status_code: int = 500):
        super().__init__(message)
        self.code = code
        self.status_code = status_code

class NotFoundError(AppError):
    def __init__(self, resource: str, id: str):
        super().__init__(f"{resource} not found: {id}", "NOT_FOUND", 404)

class ValidationError(AppError):
    def __init__(self, message: str, details: list[dict] | None = None):
        super().__init__(message, "VALIDATION_ERROR", 422)
        self.details = details or []
```

### FastAPI Global Exception Handler

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": str(exc)}},
    )

@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Log full details, return generic message
    logger.exception("Unexpected error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}},
    )
```

## Go

### Sentinel Errors and Error Wrapping

```go
package domain

import "errors"

// Sentinel errors for type-checking
var (
    ErrNotFound    = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
    ErrConflict     = errors.New("conflict")
)

// Wrap errors with context — never lose the original
func (r *UserRepository) FindByID(ctx context.Context, id string) (*User, error) {
    user, err := r.db.QueryRow(ctx, "SELECT * FROM users WHERE id = $1", id)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, fmt.Errorf("user %s: %w", id, ErrNotFound)
    }
    if err != nil {
        return nil, fmt.Errorf("querying user %s: %w", id, err)
    }
    return user, nil
}

// At the handler level, unwrap to determine response
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    user, err := h.service.GetUser(r.Context(), chi.URLParam(r, "id"))
    if err != nil {
        switch {
        case errors.Is(err, domain.ErrNotFound):
            writeError(w, http.StatusNotFound, "not_found", err.Error())
        case errors.Is(err, domain.ErrUnauthorized):
            writeError(w, http.StatusForbidden, "forbidden", "Access denied")
        default:
            slog.Error("unexpected error", "err", err)
            writeError(w, http.StatusInternalServerError, "internal_error", "An unexpected error occurred")
        }
        return
    }
    writeJSON(w, http.StatusOK, user)
}
```

## Java / Spring Boot

### Tracky: the house pattern (read this first)

Tracky has **no custom exception hierarchy and no `@ControllerAdvice`**. Errors are thrown as
`ResponseStatusException`, and `server.error.include-message: always` (in `application.yml`) puts
the message in Spring's default error body. The frontend `request()` in `api.js` reads that
`message` field and throws an `Error` with `err.status`. Keep this contract:

```java
// Validation / not found: throw from the controller, with a PT-PT message for the user
if (req.targetAmount() == null || req.targetAmount().signum() <= 0)
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O valor do objetivo tem de ser positivo.");

Goal goal = goalRepository.findByIdAndUserId(id, user.getId())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Objetivo não encontrado."));
```

- Use `404` for a resource of another user too (never `403`): do not reveal that the id exists.
- **Never a bare `.orElseThrow()` on a repository lookup.** It throws `NoSuchElementException`,
  which Spring turns into a **500**. (Tracky had this in every controller until it was fixed; a
  controller with several lookups gets a small `require(user, id)` helper, as in `GoalController`.)
  A reference to another entity **in the request body** (e.g. `accountId` in `requireAccount`) is
  a `400`, not a `404`: the URL is fine, the input is not.
- The message is **user-facing** (shown in a toast). Write it in PT-PT, with no stack trace,
  SQL, class names or ids of other users.
- Only introduce a `@RestControllerAdvice` if many controllers repeat the same mapping. If you
  add one, keep the `{ "message": ... }` field in the body, or `api.js` shows only "Erro 400".

### Checked exceptions and parsing

Catch the **narrowest** exception at the boundary and convert it. Never `catch (Exception e)`
around business logic.

```java
LocalDate date;
try {
    date = LocalDate.parse(raw);
} catch (DateTimeParseException e) {
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Data inválida: " + raw, e);
}
```

Money: parse to `BigDecimal` (never `double`) and reject `NaN`, negative or absurd values
explicitly. `NumberFormatException` → `400`, not `500`.

### Degrade, do not fail: external services

Price and FX lookups (Yahoo Finance, CoinGecko) can fail at any time. The rule is **fail safe
and say so**, not throw to the user:

```java
// Sketch — adapt to the real CurrencyService / PriceService signatures
public Rate rateFor(String currency) {
    try {
        return new Rate(fetchRate(currency), true);          // live
    } catch (IOException | RuntimeException e) {
        log.warn("Câmbio EUR{} indisponível: {}", currency, e.toString());
        return new Rate(BigDecimal.ONE, false);              // rateLive=false → UI warns
    }
}
```

- Always set **connect and read timeouts** on HTTP clients (`HttpClient.newBuilder().connectTimeout(...)`,
  `HttpRequest.newBuilder().timeout(...)`).
- A fallback value must be **visible** to the caller (`rateLive`, `fallbackValue`), never a silent
  default that looks like real data.
- Broad `catch (Exception e)` is acceptable only at these outer edges (external calls,
  schedulers, schema fix-ups) and must log with context.

### Schedulers and background jobs

An exception in a `@Scheduled` method is logged by Spring and the run is lost. Isolate per user
so one bad row does not stop the others, and keep the job idempotent (`lastAppliedMonth`):

```java
for (User u : users) {
    try {
        contributionService.applyFor(u, month);
    } catch (Exception e) {
        log.error("Reforço falhou para o utilizador {} ({}): {}", u.getId(), month, e.toString(), e);
    }
}
```

### Transactions

- `@Transactional` rolls back on **unchecked** exceptions only. If you throw a checked exception
  inside, add `rollbackFor = Exception.class` or wrap it.
- Do not catch and swallow inside a transactional method: the transaction commits a half-done change.

### Logging

- SLF4J with placeholders: `log.warn("... {}", value)`, not string concatenation.
- Pass the exception as the **last** argument to keep the stack trace: `log.error("msg {}", id, e)`.
- Never log tokens, passwords, `JWT_SECRET`, the invite code or full bank statement lines.

### Testing errors (JUnit)

```java
mockMvc.perform(post("/api/goals").contentType(JSON).content("{\"targetAmount\":-1}")
        .header("Authorization", bearer(user)))
    .andExpect(status().isBadRequest())
    // MockMvc has no /error dispatch: the body is empty, the message is the "reason"
    .andExpect(status().reason(containsString("positivo")));

// Another user's resource → 404, not 403 and not 200
mockMvc.perform(get("/api/goals/" + otherUsersGoalId).header("Authorization", bearer(user)))
    .andExpect(status().isNotFound());
```

### Frontend side (Tracky)

- Show errors with `useToast()` and the `err.message` from `api.js`.
- **Only a 401 ends the session.** Filter by `err.status`; never `.catch(() => clearToken())`.
  A 502 (backend restarting) or no network must show a message and keep the session.

## Retry with Exponential Backoff

```typescript
interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  retryIf?: (error: unknown) => boolean
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    retryIf = () => true,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts || !retryIf(error)) throw error

      const jitter = Math.random() * baseDelayMs
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1) + jitter, maxDelayMs)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

// Usage: retry transient network errors, not 4xx
const data = await withRetry(() => fetch('/api/data').then(r => r.json()), {
  maxAttempts: 3,
  retryIf: (error) => !(error instanceof AppError && error.statusCode < 500),
})
```

## User-Facing Error Messages

Map error codes to human-readable messages. Keep technical details out of user-visible text.

```typescript
const USER_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'The requested item could not be found.',
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: "You don't have permission to do that.",
  VALIDATION_ERROR: 'Please check your input and try again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again later.',
}

export function getUserMessage(code: string): string {
  return USER_ERROR_MESSAGES[code] ?? USER_ERROR_MESSAGES.INTERNAL_ERROR
}
```

## Error Handling Checklist

Before merging any code that touches error handling:

- [ ] Every `catch` block handles, re-throws, or logs — no silent swallowing
- [ ] API errors follow one envelope (Tracky: Spring's default body, read via its `message` field)
- [ ] User-facing messages contain no stack traces or internal details
- [ ] Full error context is logged server-side
- [ ] Custom error classes extend a base `AppError` with a `code` field
- [ ] Async functions surface errors to callers — no fire-and-forget without fallback
- [ ] Retry logic only retries retriable errors (not 4xx client errors)
- [ ] Java: `ResponseStatusException` with a PT-PT message; no `catch (Exception e)` around business logic
- [ ] Java: external calls have timeouts and a visible fallback (`rateLive`, `fallbackValue`)
- [ ] Java: another user's resource returns 404; the MockMvc test asserts the status and `status().reason(...)` (the JSON body with `message` only exists in the real server)
- [ ] React components are wrapped in `ErrorBoundary` for rendering errors
