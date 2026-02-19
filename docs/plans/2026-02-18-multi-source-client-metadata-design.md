# hubot-tumble: Multi-Source Client Metadata Support

## Summary

Update hubot-tumble to send client metadata fields (`client_type`, `client_network`, `client_channel`, `client_user_id`, `client_user_name`) with every link and quote POST request. This aligns the Hubot client with the Tumble API's multi-source support, enabling per-platform duplicate detection and source-aware queries.

## Approach

Centralized `getClientMetadata(robot, msg)` helper in `src/utils.js`. Each module calls it and spreads the result into the POST body.

## Platform Field Mapping

| Field | Slack | IRC |
|-------|-------|-----|
| `client_type` | `"slack"` | `"irc"` |
| `client_network` | Workspace team ID (e.g., `T12345`) | `HUBOT_TUMBLE_IRC_NETWORK` env var |
| `client_channel` | Channel ID (e.g., `C67890`) | Channel name (e.g., `#tumble`) |
| `client_user_id` | Slack user ID (e.g., `U99999`) | `null` |
| `client_user_name` | Display name from Slack profile | IRC nick |

Shell adapter sends no client fields (empty object spread).

## Component Design

### 1. `getClientMetadata(robot, msg)` — `src/utils.js`

Returns a plain object with client fields based on the active adapter:

- **Slack**: All 5 fields. Team ID read from `robot._tumbleSlackTeamId` (cached at startup) or `HUBOT_TUMBLE_SLACK_TEAM_ID` env var. Channel ID and user ID from `msg.message`. Display name from Slack brain data with fallback to `msg.message.user.name`.
- **IRC**: 4 fields. `client_user_id` is null. Network from `HUBOT_TUMBLE_IRC_NETWORK` env var. Channel and username from `msg.message`.
- **Shell/unknown**: Empty object `{}`.

### 2. `ensureSlackTeamId(robot)` — `src/utils.js`

Async function that resolves the Slack workspace team ID before any listeners are registered.

Resolution order:
1. If `HUBOT_TUMBLE_SLACK_TEAM_ID` env var is set, use it immediately.
2. Otherwise, call `auth.test` via the Slack WebClient and cache `result.team_id` on `robot._tumbleSlackTeamId`.

Behavior:
- Non-Slack adapters: returns immediately (no-op).
- Idempotent: subsequent calls return immediately if team ID is already cached.
- Fails loudly: if `auth.test` fails, logs an error and does not register listeners. No messages are processed without complete metadata.

### 3. POST Body Changes — `src/links.js`, `src/quotes.js`

Each module wraps its listener registration in `ensureSlackTeamId(robot).then(...)`. Inside the listener, the POST body is constructed by spreading `getClientMetadata(robot, msg)` into the existing object:

```javascript
const client = getClientMetadata(robot, msg);
const body = JSON.stringify({ url, user, ...client });
```

No changes to DELETE or GET calls.

### 4. Ping Command — `src/ping.js`

Updated to report:
- `HUBOT_TUMBLE_IRC_NETWORK` status for IRC adapters.
- Slack team ID resolution status for Slack adapters (resolved value, env var, or not available).

### 5. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `HUBOT_TUMBLE_SLACK_TEAM_ID` | No | Override for Slack workspace team ID. If unset, resolved via `auth.test`. |
| `HUBOT_TUMBLE_IRC_NETWORK` | No (recommended) | IRC server hostname (e.g., `irc.libera.chat`). Sent as `client_network`. |

## Test Plan

### New: `test/utils_test.js`
- `getClientMetadata` returns correct Slack fields with mocked adapter.
- `getClientMetadata` returns correct IRC fields with `HUBOT_TUMBLE_IRC_NETWORK` set.
- `getClientMetadata` returns empty object for Shell adapter.
- `ensureSlackTeamId` uses env var when set, skips API call.
- `ensureSlackTeamId` is a no-op for non-Slack adapters.

### Updated: `test/links_test.js`
- Existing Shell-adapter tests verify POST body has no client fields (backward-compatible).
- New test cases mock Slack adapter and verify all 5 client fields in POST body.
- New test cases mock IRC adapter and verify 4 client fields in POST body.

### Updated: `test/quotes_test.js`
- Same pattern as links: Shell tests unchanged, new Slack/IRC test cases for standard and overheard quotes.

### Updated: `test/test_helper.js`
- Add adapter mock helpers for Slack and IRC reuse across test files.

### Unchanged
- `test/delete_tumble_test.js`, `test/delete_quote_test.js`, `test/ping_test.js` — no client metadata in DELETE/GET calls.

## Files Changed

| File | Change |
|------|--------|
| `src/utils.js` | Add `getClientMetadata`, `ensureSlackTeamId`, export both |
| `src/links.js` | Gate listeners on `ensureSlackTeamId`, spread client metadata into POST |
| `src/quotes.js` | Gate listeners on `ensureSlackTeamId`, spread client metadata into POST |
| `src/ping.js` | Report new env var status |
| `test/utils_test.js` | New file — unit tests for helper and init |
| `test/links_test.js` | Updated assertions, new Slack/IRC test cases |
| `test/quotes_test.js` | Updated assertions, new Slack/IRC test cases |
| `test/test_helper.js` | Adapter mock helpers |
| `README.md` | Document new env vars |

## Files Unchanged

`src/delete_tumble.js`, `src/delete_quote.js`, `src/index.js`, `test/delete_tumble_test.js`, `test/delete_quote_test.js`, `test/ping_test.js`
