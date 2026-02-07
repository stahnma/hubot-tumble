# hubot-tumble

A Hubot plugin for [Tumble](https://github.com/stahnma/tumble), a link and quote aggregator. This plugin automatically captures URLs and quotes shared in chat and posts them to a Tumble server.

## Installation

Add `hubot-tumble` to your hubot's dependencies or include it as a local module:

```javascript
// In your hubot's external-scripts.json or load directly
robot.loadFile('/path/to/hubot-tumble', 'index.js')
```

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `HUBOT_TUMBLE_BASEURL` | The base URL of your Tumble server (e.g., `http://tumble.example.com`) |

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `HUBOT_TUMBLE_DELETE_SECRET` | Admin secret for delete API calls. Not required when `HUBOT_TUMBLE_BASEURL` points to localhost/127.0.0.1/::1 |
| `DEBUG` | Set to `1` or `true` to enable debug logging |

## Features

### Link Capture

Any HTTP/HTTPS URL posted in chat is automatically captured and sent to Tumble.

**Behavior:**
- URLs are extracted from messages and posted to the Tumble API
- Zoom links (`zoom.us`) are automatically excluded
- Duplicate detection: If a link was previously posted, the bot responds with "Welcome to X ago." instead of creating a duplicate entry

**Slack-specific:**
- Adds a :fish: reaction to the original message
- Posts a notification to the `#tumble-info` channel with link details and a permalink to the original Slack message

**Shell adapter:**
- Responds with the tumble link ID and URL

### Quote Capture

Quotes in the format `"quote text" -- author` are automatically captured.

**Supported formats:**
```
"This is a quote" -- Author Name
"This is a quote" — Author Name
"Smart quotes work too" -- Author
```

**Behavior:**
- Quotes are posted to the Tumble `/quote` endpoint
- Both straight quotes (`"`) and smart quotes (`"`) are supported
- Both double-hyphen (`--`) and em-dash (`—`) work as separators

**Slack-specific:**
- Adds a :speech_balloon: reaction to the original message
- Posts a notification to the `#tumble-info` channel

**Shell adapter:**
- Responds with confirmation of the posted quote

### Delete Links

Delete tumble entries via command or emoji reaction.

**Commands:**
```
hubot tumble delete <id>    # Delete a tumble link by ID
```

**Slack-specific:**
- React with :x: emoji on a tumble link message to delete it
- Adds :white_check_mark: reaction on successful deletion

**Authorization (Slack only):**
1. **Own link within 5 minutes**: Users can delete their own links within 5 minutes of posting
2. **Workspace admin**: Slack workspace admins/owners can delete any link at any time
3. **Otherwise**: Deletion is denied with an appropriate message

**Shell adapter:**
- Direct delete without authorization checks (requires `HUBOT_TUMBLE_DELETE_SECRET` unless using localhost)

**Response messages:**

| Scenario | Message |
|----------|---------|
| Success (own link) | "Deleted tumble link 12345 (own link)." |
| Success (admin) | "Deleted tumble link 12345 (as workspace admin)." |
| Denied (not owner) | "Only alice or a workspace admin can delete this link." |
| Denied (time expired) | "You can only delete your own links within 5 minutes of posting..." |
| Error (no secret) | "Delete functionality requires HUBOT_TUMBLE_DELETE_SECRET to be set." |
| Error (not found) | "Link 12345 not found." |

## Tumble API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/link/` | POST | Create a new link entry |
| `/quote` | POST | Create a new quote entry |
| `/link/{id}.json` | GET | Get link metadata |
| `/link/{id}` | DELETE | Delete a link (requires `X-Admin-Secret` header) |

## Development

```bash
# Run tests
npm test

# Run linter
npm run lint
```

## License

MIT
