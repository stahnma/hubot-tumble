const { Helper, expect, nock, TUMBLE_BASE, setupEnv, cleanupEnv, wait } = require('./test_helper');

const helper = new Helper('../src/links.js');

describe('links', function () {
  let room;

  beforeEach(function () {
    setupEnv();
    room = helper.createRoom();
    nock.cleanAll();
  });

  afterEach(function () {
    room.destroy();
    cleanupEnv();
    nock.cleanAll();
  });

  describe('posting links', function () {
    it('posts a link to tumble API v1', async function () {
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/links', body => {
          return body.url === 'https://example.com/article' && body.user;
        })
        .reply(200, { id: 12345, url: 'https://example.com/article' });

      await room.user.say('alice', 'Check out https://example.com/article');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(room.messages.length).to.be.greaterThan(1);
      // Shell adapter should get a simple acknowledgment
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('12345');
    });

    it('sends JSON content-type header', async function () {
      const scope = nock(TUMBLE_BASE, {
        reqheaders: {
          'content-type': 'application/json',
        },
      })
        .post('/api/v1/links')
        .reply(200, { id: 123, url: 'https://example.com' });

      await room.user.say('alice', 'https://example.com');
      await wait(100);

      expect(scope.isDone()).to.be.true;
    });

    it('handles duplicate links with created_at timestamp', async function () {
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/links')
        .reply(200, {
          id: 999,
          is_duplicate: true,
          previous_submissions: [
            {
              id: 123,
              created_at: '2024-01-15T10:30:00Z',
              user: 'bob',
            },
          ],
        });

      await room.user.say('alice', 'https://example.com/old-link');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('Welcome to');
    });

    it('ignores zoom links', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/links').reply(200, { id: 1 });

      await room.user.say('alice', 'Join my meeting https://zoom.us/j/123456');
      await wait(100);

      expect(scope.isDone()).to.be.false;
    });

    it('ignores links prefixed with !', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/links').reply(200, { id: 1 });

      await room.user.say('alice', 'Do not post !https://example.com/private');
      await wait(100);

      expect(scope.isDone()).to.be.false;
    });

    it('handles API errors gracefully', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/links').reply(500, 'Internal Server Error');

      await room.user.say('alice', 'https://example.com/will-fail');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('Failed to post link');
    });

    it('extracts the last URL from a message with multiple URLs', async function () {
      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/links', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 456 });

      await room.user.say('alice', 'First https://first.com then https://second.com');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.url).to.equal('https://second.com');
    });
  });

  describe('response parsing', function () {
    it('uses id field from v1 API response', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/links').reply(200, {
        id: 99999,
        url: 'https://example.com',
        user: 'alice',
        created_at: '2024-01-20T12:00:00Z',
      });

      await room.user.say('alice', 'https://example.com');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('99999');
    });

    it('handles malformed JSON response', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/links').reply(200, 'not json');

      await room.user.say('alice', 'https://example.com');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('Failed to parse');
    });
  });
});
