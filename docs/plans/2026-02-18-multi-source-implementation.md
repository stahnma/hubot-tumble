# Multi-Source Client Metadata Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update hubot-tumble to send client metadata fields with every link and quote POST request, enabling per-platform duplicate detection and source-aware queries.

**Architecture:** Centralized `getClientMetadata(robot, msg)` helper in `src/utils.js` returns platform-specific fields. `ensureSlackTeamId(robot)` gates listener registration until Slack team ID is resolved. Each module spreads the metadata into its POST body.

**Tech Stack:** Node.js, Hubot, @slack/client WebClient, Mocha/Chai/nock for testing

**Design doc:** `docs/plans/2026-02-18-multi-source-client-metadata-design.md`

---

### Task 1: Add platform detection helpers to utils.js

**Files:**
- Modify: `src/utils.js`
- Create: `test/utils_test.js`

**Step 1: Write failing tests for isSlack and isIrc**

Create `test/utils_test.js`:

```javascript
const { expect } = require('./test_helper');

const { isSlack, isIrc } = require('../src/utils');

describe('utils', function () {
  describe('isSlack', function () {
    it('returns true when adapter has options.token', function () {
      const robot = { adapter: { options: { token: 'xoxb-fake' } } };
      expect(isSlack(robot)).to.be.true;
    });

    it('returns false when adapter has no token', function () {
      const robot = { adapter: {} };
      expect(isSlack(robot)).to.be.false;
    });

    it('returns false when adapter is null', function () {
      const robot = {};
      expect(isSlack(robot)).to.be.false;
    });
  });

  describe('isIrc', function () {
    it('returns true when adapter has bot and no token', function () {
      const robot = { adapter: { bot: {} } };
      expect(isIrc(robot)).to.be.true;
    });

    it('returns false when adapter has token (Slack)', function () {
      const robot = { adapter: { bot: {}, options: { token: 'xoxb-fake' } } };
      expect(isIrc(robot)).to.be.false;
    });

    it('returns false for shell adapter', function () {
      const robot = { adapter: {} };
      expect(isIrc(robot)).to.be.false;
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/utils_test.js --reporter spec`
Expected: FAIL with "isSlack is not a function" (not yet exported)

**Step 3: Implement isSlack and isIrc in utils.js**

Add before the `module.exports` block in `src/utils.js`:

```javascript
/**
 * Checks if the robot is running on the Slack adapter.
 */
const isSlack = robot => {
  return !!(robot.adapter && robot.adapter.options && robot.adapter.options.token);
};

/**
 * Checks if the robot is running on the IRC adapter.
 */
const isIrc = robot => {
  return !!(robot.adapter && robot.adapter.bot && !isSlack(robot));
};
```

Add `isSlack` and `isIrc` to the `module.exports` object.

**Step 4: Run tests to verify they pass**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/utils_test.js --reporter spec`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
cd /home/stahnma/development/personal/tumble/hubot-tumble
git add src/utils.js test/utils_test.js
git commit -m "feat: add isSlack and isIrc platform detection helpers to utils"
```

---

### Task 2: Add getClientMetadata to utils.js

**Files:**
- Modify: `src/utils.js`
- Modify: `test/utils_test.js`

**Step 1: Write failing tests for getClientMetadata**

Append to the `describe('utils', ...)` block in `test/utils_test.js`:

```javascript
  describe('getClientMetadata', function () {
    const { getClientMetadata } = require('../src/utils');

    it('returns Slack fields when adapter is Slack', function () {
      const robot = {
        adapter: { options: { token: 'xoxb-fake' } },
        _tumbleSlackTeamId: 'T12345',
        brain: { data: { users: {} } },
      };
      const msg = {
        message: {
          user: { id: 'U99999', name: 'alice' },
          room: 'C67890',
        },
      };

      const result = getClientMetadata(robot, msg);
      expect(result.client_type).to.equal('slack');
      expect(result.client_network).to.equal('T12345');
      expect(result.client_channel).to.equal('C67890');
      expect(result.client_user_id).to.equal('U99999');
      expect(result.client_user_name).to.equal('alice');
    });

    it('uses Slack display_name from brain when available', function () {
      const robot = {
        adapter: { options: { token: 'xoxb-fake' } },
        _tumbleSlackTeamId: 'T12345',
        brain: {
          data: {
            users: {
              U99999: { slack: { profile: { display_name: 'Alice S' } } },
            },
          },
        },
      };
      const msg = {
        message: {
          user: { id: 'U99999', name: 'alice' },
          room: 'C67890',
        },
      };

      const result = getClientMetadata(robot, msg);
      expect(result.client_user_name).to.equal('Alice S');
    });

    it('falls back to HUBOT_TUMBLE_SLACK_TEAM_ID env var', function () {
      process.env.HUBOT_TUMBLE_SLACK_TEAM_ID = 'T-FROM-ENV';
      const robot = {
        adapter: { options: { token: 'xoxb-fake' } },
        brain: { data: { users: {} } },
      };
      const msg = {
        message: {
          user: { id: 'U99999', name: 'alice' },
          room: 'C67890',
        },
      };

      const result = getClientMetadata(robot, msg);
      expect(result.client_network).to.equal('T-FROM-ENV');
      delete process.env.HUBOT_TUMBLE_SLACK_TEAM_ID;
    });

    it('returns IRC fields when adapter is IRC', function () {
      process.env.HUBOT_TUMBLE_IRC_NETWORK = 'irc.libera.chat';
      const robot = { adapter: { bot: {} } };
      const msg = {
        message: {
          user: { id: 'alice', name: 'alice' },
          room: '#tumble',
        },
      };

      const result = getClientMetadata(robot, msg);
      expect(result.client_type).to.equal('irc');
      expect(result.client_network).to.equal('irc.libera.chat');
      expect(result.client_channel).to.equal('#tumble');
      expect(result.client_user_id).to.be.null;
      expect(result.client_user_name).to.equal('alice');
      delete process.env.HUBOT_TUMBLE_IRC_NETWORK;
    });

    it('returns IRC fields with null network when env var not set', function () {
      delete process.env.HUBOT_TUMBLE_IRC_NETWORK;
      const robot = { adapter: { bot: {} } };
      const msg = {
        message: {
          user: { id: 'bob', name: 'bob' },
          room: '#general',
        },
      };

      const result = getClientMetadata(robot, msg);
      expect(result.client_type).to.equal('irc');
      expect(result.client_network).to.be.null;
    });

    it('returns empty object for Shell adapter', function () {
      const robot = { adapter: {} };
      const msg = {
        message: {
          user: { id: '1', name: 'shell' },
          room: 'Shell',
        },
      };

      const result = getClientMetadata(robot, msg);
      expect(result).to.deep.equal({});
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/utils_test.js --reporter spec`
Expected: FAIL with "getClientMetadata is not a function"

**Step 3: Implement getClientMetadata in utils.js**

Add to `src/utils.js` before `module.exports`:

```javascript
/**
 * Returns client metadata fields for the current adapter and message.
 * Slack: all 5 fields. IRC: 4 fields (client_user_id is null).
 * Shell/unknown: empty object.
 */
const getClientMetadata = (robot, msg) => {
  if (isSlack(robot)) {
    const userId = msg.message.user.id;
    let userName = msg.message.user.name;
    try {
      const displayName = robot.brain.data.users[userId]?.slack?.profile?.display_name;
      if (displayName) userName = displayName;
    } catch (e) {
      // No Slack brain data available
    }

    return {
      client_type: 'slack',
      client_network: robot._tumbleSlackTeamId || process.env.HUBOT_TUMBLE_SLACK_TEAM_ID || null,
      client_channel: msg.message.room,
      client_user_id: userId,
      client_user_name: userName,
    };
  }

  if (isIrc(robot)) {
    return {
      client_type: 'irc',
      client_network: process.env.HUBOT_TUMBLE_IRC_NETWORK || null,
      client_channel: msg.message.room,
      client_user_id: null,
      client_user_name: msg.message.user.name,
    };
  }

  return {};
};
```

Add `getClientMetadata` to the `module.exports` object.

**Step 4: Run tests to verify they pass**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/utils_test.js --reporter spec`
Expected: All 12 tests PASS

**Step 5: Commit**

```bash
cd /home/stahnma/development/personal/tumble/hubot-tumble
git add src/utils.js test/utils_test.js
git commit -m "feat: add getClientMetadata helper for multi-source support"
```

---

### Task 3: Add ensureSlackTeamId to utils.js

**Files:**
- Modify: `src/utils.js`
- Modify: `test/utils_test.js`

**Step 1: Write failing tests for ensureSlackTeamId**

Append to the `describe('utils', ...)` block in `test/utils_test.js`. Add `sinon` to the require at top:

```javascript
const { expect, sinon } = require('./test_helper');
```

Then add the tests:

```javascript
  describe('ensureSlackTeamId', function () {
    const { ensureSlackTeamId } = require('../src/utils');

    afterEach(function () {
      delete process.env.HUBOT_TUMBLE_SLACK_TEAM_ID;
    });

    it('is a no-op for non-Slack adapters', async function () {
      const robot = { adapter: {}, logger: { info: sinon.spy() } };
      await ensureSlackTeamId(robot);
      expect(robot._tumbleSlackTeamId).to.be.undefined;
    });

    it('uses env var when HUBOT_TUMBLE_SLACK_TEAM_ID is set', async function () {
      process.env.HUBOT_TUMBLE_SLACK_TEAM_ID = 'T-ENV-123';
      const robot = {
        adapter: { options: { token: 'xoxb-fake' } },
        logger: { info: sinon.spy() },
      };

      await ensureSlackTeamId(robot);
      expect(robot._tumbleSlackTeamId).to.equal('T-ENV-123');
    });

    it('skips API call when team ID already cached', async function () {
      const robot = {
        adapter: { options: { token: 'xoxb-fake' } },
        _tumbleSlackTeamId: 'T-CACHED',
        logger: { info: sinon.spy() },
      };

      await ensureSlackTeamId(robot);
      expect(robot._tumbleSlackTeamId).to.equal('T-CACHED');
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/utils_test.js --reporter spec`
Expected: FAIL with "ensureSlackTeamId is not a function"

**Step 3: Implement ensureSlackTeamId in utils.js**

Add to `src/utils.js` before `module.exports`:

```javascript
/**
 * Resolves and caches the Slack workspace team ID on robot._tumbleSlackTeamId.
 * Resolution order:
 *   1. Already cached on robot._tumbleSlackTeamId — return immediately
 *   2. HUBOT_TUMBLE_SLACK_TEAM_ID env var — use it, skip API call
 *   3. Slack auth.test API call — fetch and cache team_id
 * Non-Slack adapters: returns immediately (no-op).
 * Rejects if auth.test fails on Slack (prevents listener registration).
 */
const ensureSlackTeamId = async robot => {
  if (!isSlack(robot)) return;

  if (robot._tumbleSlackTeamId) return;

  const envTeamId = process.env.HUBOT_TUMBLE_SLACK_TEAM_ID;
  if (envTeamId) {
    robot._tumbleSlackTeamId = envTeamId;
    robot.logger.info(`tumble: Slack team ID from env: ${envTeamId}`);
    return;
  }

  const { WebClient } = require('@slack/client');
  const web = new WebClient(robot.adapter.options.token);
  const result = await web.auth.test();
  robot._tumbleSlackTeamId = result.team_id;
  robot.logger.info(`tumble: Slack team ID resolved: ${result.team_id}`);
};
```

Add `ensureSlackTeamId` to the `module.exports` object.

**Step 4: Run tests to verify they pass**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/utils_test.js --reporter spec`
Expected: All 15 tests PASS

**Step 5: Commit**

```bash
cd /home/stahnma/development/personal/tumble/hubot-tumble
git add src/utils.js test/utils_test.js
git commit -m "feat: add ensureSlackTeamId for gated listener registration"
```

---

### Task 4: Update test_helper.js with env cleanup

**Files:**
- Modify: `test/test_helper.js`

**Step 1: Add cleanup for new env vars**

In `test/test_helper.js`, add cleanup lines to the `cleanupEnv` function for the two new env vars:

```javascript
delete process.env.HUBOT_TUMBLE_SLACK_TEAM_ID;
delete process.env.HUBOT_TUMBLE_IRC_NETWORK;
```

**Step 2: Run existing tests to verify nothing broke**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npm test`
Expected: All existing tests PASS

**Step 3: Commit**

```bash
cd /home/stahnma/development/personal/tumble/hubot-tumble
git add test/test_helper.js
git commit -m "test: add cleanup for new client metadata env vars"
```

---

### Task 5: Update links.js to send client metadata

**Files:**
- Modify: `src/links.js`
- Modify: `test/links_test.js`

**Step 1: Write failing test for Shell adapter backward compatibility**

Add a test to `test/links_test.js` in the `posting links` describe block that explicitly checks for the absence of client fields:

```javascript
    it('does not send client fields on Shell adapter', async function () {
      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/links', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 789 });

      await room.user.say('alice', 'https://example.com/shell-test');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.client_type).to.be.undefined;
      expect(capturedBody.client_network).to.be.undefined;
      expect(capturedBody.client_channel).to.be.undefined;
      expect(capturedBody.client_user_id).to.be.undefined;
      expect(capturedBody.client_user_name).to.be.undefined;
    });
```

**Step 2: Run test to verify it passes (baseline — no client fields currently sent)**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/links_test.js --reporter spec`
Expected: PASS (Shell adapter already sends no client fields)

**Step 3: Write failing test for Slack client metadata**

Add a new `describe` block to `test/links_test.js`:

```javascript
  describe('client metadata', function () {
    it('sends Slack client fields in POST body', async function () {
      // Mock Slack adapter on the room's robot
      room.robot.adapter.options = { token: 'xoxb-fake' };
      room.robot._tumbleSlackTeamId = 'T12345';
      room.robot.brain.data.users = {};

      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/links', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 555 });

      await room.user.say('alice', 'https://example.com/slack-test');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.client_type).to.equal('slack');
      expect(capturedBody.client_network).to.equal('T12345');
      expect(capturedBody.client_channel).to.equal('room1');
      expect(capturedBody.client_user_id).to.equal('alice');
      expect(capturedBody.client_user_name).to.equal('alice');
    });

    it('sends IRC client fields in POST body', async function () {
      // Mock IRC adapter on the room's robot
      room.robot.adapter.options = {};
      room.robot.adapter.bot = {};
      process.env.HUBOT_TUMBLE_IRC_NETWORK = 'irc.libera.chat';

      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/links', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 556 });

      await room.user.say('alice', 'https://example.com/irc-test');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.client_type).to.equal('irc');
      expect(capturedBody.client_network).to.equal('irc.libera.chat');
      expect(capturedBody.client_channel).to.equal('room1');
      expect(capturedBody.client_user_id).to.be.null;
      expect(capturedBody.client_user_name).to.equal('alice');
    });
  });
```

**Step 4: Run tests to verify the new client metadata tests fail**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/links_test.js --reporter spec`
Expected: New client metadata tests FAIL (client fields not yet sent)

**Step 5: Update links.js to gate on ensureSlackTeamId and send client metadata**

In `src/links.js`, add to the require at the top:

```javascript
const { shouldIgnoreMessage, ensureSlackTeamId, getClientMetadata } = require('./utils');
```

Wrap the `robot.hear(...)` call inside `ensureSlackTeamId(robot).then(...)`:

Replace the current structure:
```javascript
  // Process a tumble link
  robot.hear(/http:\/\/|https:\/\//i, msg => {
```

With:
```javascript
  // Gate listener registration on Slack team ID resolution
  ensureSlackTeamId(robot)
    .then(() => {
      // Process a tumble link
      robot.hear(/http:\/\/|https:\/\//i, msg => {
```

At the end of the `robot.hear` callback, close the `.then()` and add error handling:
```javascript
    });
  })
  .catch(err => {
    robot.logger.error(`tumble: Failed to initialize links module: ${err.message}`);
  });
```

Inside `postLinkToTumble`, update the `data` line (line 122 currently) to include client metadata:

Replace:
```javascript
      const data = JSON.stringify({ url: url, user: user });
```

With:
```javascript
      const client = getClientMetadata(robot, msg);
      const data = JSON.stringify({ url: url, user: user, ...client });
```

**Step 6: Update beforeEach in links_test.js to wait for async listener registration**

The `ensureSlackTeamId` wrapper makes listener registration async (via `.then()`). Update `beforeEach` to be async and add a wait:

Replace:
```javascript
  beforeEach(function () {
    setupEnv();
    room = helper.createRoom();
    nock.cleanAll();
  });
```

With:
```javascript
  beforeEach(async function () {
    setupEnv();
    room = helper.createRoom();
    await wait();
    nock.cleanAll();
  });
```

**Step 7: Run all link tests to verify they pass**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/links_test.js --reporter spec`
Expected: All tests PASS including new client metadata tests

Note: The `client_channel` value for the Slack test may be `room1` (hubot-test-helper's default room name) rather than a Slack channel ID. Adjust the expected value if needed based on what `msg.message.room` returns in tests.

**Step 8: Run full test suite to check for regressions**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npm test`
Expected: All tests PASS

**Step 9: Commit**

```bash
cd /home/stahnma/development/personal/tumble/hubot-tumble
git add src/links.js test/links_test.js
git commit -m "feat: send client metadata in link POST requests"
```

---

### Task 6: Update quotes.js to send client metadata

**Files:**
- Modify: `src/quotes.js`
- Modify: `test/quotes_test.js`

**Step 1: Write failing tests for quote client metadata**

Add a new `describe` block to `test/quotes_test.js`:

```javascript
  describe('client metadata', function () {
    it('sends Slack client fields for standard quotes', async function () {
      room.robot.adapter.options = { token: 'xoxb-fake' };
      room.robot._tumbleSlackTeamId = 'T12345';
      room.robot.brain.data.users = {};

      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/quotes', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 200 });

      await room.user.say('alice', '"Great quote" -- Author');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.client_type).to.equal('slack');
      expect(capturedBody.client_network).to.equal('T12345');
      expect(capturedBody.client_channel).to.equal('room1');
      expect(capturedBody.client_user_id).to.equal('alice');
      expect(capturedBody.client_user_name).to.equal('alice');
    });

    it('sends IRC client fields for standard quotes', async function () {
      room.robot.adapter.options = {};
      room.robot.adapter.bot = {};
      process.env.HUBOT_TUMBLE_IRC_NETWORK = 'irc.libera.chat';

      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/quotes', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 201 });

      await room.user.say('alice', '"IRC quote" -- Someone');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.client_type).to.equal('irc');
      expect(capturedBody.client_network).to.equal('irc.libera.chat');
      expect(capturedBody.client_user_id).to.be.null;
      expect(capturedBody.client_user_name).to.equal('alice');
    });

    it('sends Slack client fields for overheard quotes', async function () {
      room.robot.adapter.options = { token: 'xoxb-fake' };
      room.robot._tumbleSlackTeamId = 'T12345';
      room.robot.brain.data.users = {};

      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/quotes', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 202 });

      await room.user.say('alice', 'OH: Something funny');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.client_type).to.equal('slack');
      expect(capturedBody.client_network).to.equal('T12345');
    });

    it('does not send client fields on Shell adapter', async function () {
      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/quotes', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 203 });

      await room.user.say('alice', '"Shell quote" -- Author');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.client_type).to.be.undefined;
    });
  });
```

**Step 2: Run tests to verify the new tests fail**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/quotes_test.js --reporter spec`
Expected: New client metadata tests FAIL

**Step 3: Update quotes.js to gate on ensureSlackTeamId and send client metadata**

In `src/quotes.js`, update the require at the top:

```javascript
const { shouldIgnoreMessage, ensureSlackTeamId, getClientMetadata } = require('./utils');
```

Wrap both `robot.hear(...)` calls inside `ensureSlackTeamId(robot).then(...)`:

Replace the current structure starting at the first `robot.hear`:
```javascript
  // Tumble quotes:
  robot.hear(/^\s*(\"|")(.+?)(\"|")\s+(--|—)\s*(.+?)$/, msg => {
```

With:
```javascript
  ensureSlackTeamId(robot)
    .then(() => {
      // Tumble quotes:
      robot.hear(/^\s*(\"|")(.+?)(\"|")\s+(--|—)\s*(.+?)$/, msg => {
```

For the standard quote POST body (currently line 71), replace:
```javascript
    const data = JSON.stringify({ quote: quote, author: author, poster: poster });
```

With:
```javascript
    const client = getClientMetadata(robot, msg);
    const data = JSON.stringify({ quote: quote, author: author, poster: poster, ...client });
```

For the overheard quote POST body (currently line 161), replace:
```javascript
    const data = JSON.stringify({ quote: quote, poster: poster });
```

With:
```javascript
    const client = getClientMetadata(robot, msg);
    const data = JSON.stringify({ quote: quote, poster: poster, ...client });
```

After the closing of the overheard `robot.hear` callback, close the `.then()` and add error handling:
```javascript
      });
    })
    .catch(err => {
      robot.logger.error(`tumble: Failed to initialize quotes module: ${err.message}`);
    });
```

**Step 4: Update beforeEach in quotes_test.js to wait for async listener registration**

Replace:
```javascript
  beforeEach(function () {
    setupEnv();
    room = helper.createRoom();
    nock.cleanAll();
  });
```

With:
```javascript
  beforeEach(async function () {
    setupEnv();
    room = helper.createRoom();
    await wait();
    nock.cleanAll();
  });
```

**Step 5: Run all quote tests to verify they pass**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npx mocha test/quotes_test.js --reporter spec`
Expected: All tests PASS

**Step 6: Run full test suite**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npm test`
Expected: All tests PASS

**Step 7: Commit**

```bash
cd /home/stahnma/development/personal/tumble/hubot-tumble
git add src/quotes.js test/quotes_test.js
git commit -m "feat: send client metadata in quote POST requests"
```

---

### Task 7: Update ping.js to report new env vars

**Files:**
- Modify: `src/ping.js`

**Step 1: Add reporting for new env vars**

In `src/ping.js`, add env var reads near the top of the module (after the existing `ircAdminChannel` line):

```javascript
const ircNetwork = env.HUBOT_TUMBLE_IRC_NETWORK;
```

After the existing IRC admin channel check (after the `if (adapterType === 'IRC')` block around line 118), add IRC network reporting inside the same condition:

```javascript
    if (ircNetwork) {
      checks.push(`HUBOT_TUMBLE_IRC_NETWORK: ${ircNetwork}`);
    } else {
      checks.push('HUBOT_TUMBLE_IRC_NETWORK: not set (client_network will be null)');
    }
```

After the adapter type check, add a Slack-specific block:

```javascript
    if (adapterType === 'Slack') {
      const teamId = robot._tumbleSlackTeamId || env.HUBOT_TUMBLE_SLACK_TEAM_ID;
      if (teamId) {
        checks.push(`Slack team ID: ${teamId}`);
      } else {
        checks.push('Slack team ID: not resolved (client_network will be null)');
      }
    }
```

**Step 2: Run full test suite to check for regressions**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npm test`
Expected: All tests PASS (ping tests don't check for these new lines)

**Step 3: Commit**

```bash
cd /home/stahnma/development/personal/tumble/hubot-tumble
git add src/ping.js
git commit -m "feat: report client metadata env vars in tumble ping"
```

---

### Task 8: Update README

**Files:**
- Modify: `README.md`

**Step 1: Add new env vars to the Optional Environment Variables table**

In `README.md`, add two rows to the Optional Environment Variables table:

```markdown
| `HUBOT_TUMBLE_SLACK_TEAM_ID`   | Slack workspace team ID override. If not set, auto-detected via Slack `auth.test` API.        |
| `HUBOT_TUMBLE_IRC_NETWORK`     | IRC server hostname (e.g., `irc.libera.chat`). Sent as `client_network` in API requests.      |
```

**Step 2: Commit**

```bash
cd /home/stahnma/development/personal/tumble/hubot-tumble
git add README.md
git commit -m "docs: document client metadata env vars in README"
```

---

### Task 9: Final verification

**Step 1: Run full test suite**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && npm test`
Expected: All tests PASS

**Step 2: Review git log**

Run: `cd /home/stahnma/development/personal/tumble/hubot-tumble && git log --oneline -10`
Expected: 8 commits from this implementation (design doc + 7 implementation commits)
