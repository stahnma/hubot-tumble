const { Helper, expect, nock, TUMBLE_BASE, setupEnv, cleanupEnv, wait } = require('./test_helper');

// Note: Environment variables are read at module load time, so tests that require
// different env values need to use separate describe blocks with their own helper instances

describe('delete_quote', function () {
  describe('with API key configured', function () {
    const helper = new Helper('../src/delete_quote.js');
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

    describe('tumble delete quote <id> command', function () {
      it('deletes a quote using v1 API endpoint', async function () {
        const scope = nock(TUMBLE_BASE).delete('/api/v1/quotes/12345').reply(200, { success: true });

        await room.user.say('alice', '@hubot tumble delete quote 12345');
        await wait(100);

        expect(scope.isDone()).to.be.true;
        const response = room.messages.find(m => m[0] === 'hubot');
        expect(response[1]).to.include('Deleted tumble quote 12345');
      });

      it('sends X-API-Key header', async function () {
        const scope = nock(TUMBLE_BASE, {
          reqheaders: {
            'x-api-key': 'test-api-key',
          },
        })
          .delete('/api/v1/quotes/123')
          .reply(200, { success: true });

        await room.user.say('alice', '@hubot tumble delete quote 123');
        await wait(100);

        expect(scope.isDone()).to.be.true;
      });

      it('handles not found error', async function () {
        const scope = nock(TUMBLE_BASE).delete('/api/v1/quotes/99999').reply(404, 'Not Found');

        await room.user.say('alice', '@hubot tumble delete quote 99999');
        await wait(100);

        expect(scope.isDone()).to.be.true;
        const response = room.messages.find(m => m[0] === 'hubot');
        expect(response[1]).to.include('not found');
      });

      it('handles server error', async function () {
        const scope = nock(TUMBLE_BASE).delete('/api/v1/quotes/123').reply(500, 'Server Error');

        await room.user.say('alice', '@hubot tumble delete quote 123');
        await wait(100);

        expect(scope.isDone()).to.be.true;
        const response = room.messages.find(m => m[0] === 'hubot');
        expect(response[1]).to.include('Failed to delete');
      });

      it('accepts "tumble quote delete" syntax', async function () {
        const scope = nock(TUMBLE_BASE).delete('/api/v1/quotes/789').reply(200, { success: true });

        await room.user.say('alice', '@hubot tumble quote delete 789');
        await wait(100);

        expect(scope.isDone()).to.be.true;
        const response = room.messages.find(m => m[0] === 'hubot');
        expect(response[1]).to.include('Deleted tumble quote 789');
      });
    });

    describe('getQuoteInfo', function () {
      it('uses v1 API endpoint for fetching quote info', async function () {
        const scope = nock(TUMBLE_BASE).delete('/api/v1/quotes/456').reply(200, { success: true });

        await room.user.say('alice', '@hubot tumble delete quote 456');
        await wait(100);

        expect(scope.isDone()).to.be.true;
      });
    });
  });

  describe('with localhost (no API key required)', function () {
    // Set up env before requiring the module
    before(function () {
      setupEnv({
        HUBOT_TUMBLE_BASEURL: 'http://localhost:3000',
        HUBOT_TUMBLE_API_KEY: undefined,
      });
    });

    after(function () {
      cleanupEnv();
    });

    const helper = new Helper('../src/delete_quote.js');
    let room;

    beforeEach(function () {
      room = helper.createRoom();
      nock.cleanAll();
    });

    afterEach(function () {
      room.destroy();
      nock.cleanAll();
    });

    it('allows delete without API key for localhost', async function () {
      const scope = nock('http://localhost:3000')
        .delete('/api/v1/quotes/123')
        .reply(200, { success: true });

      await room.user.say('alice', '@hubot tumble delete quote 123');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('Deleted tumble quote 123');
    });
  });
});
