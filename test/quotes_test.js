const { Helper, expect, nock, TUMBLE_BASE, setupEnv, cleanupEnv, wait } = require('./test_helper');

const helper = new Helper('../src/quotes.js');

describe('quotes', function () {
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

  describe('standard quotes', function () {
    it('posts a quote with double-hyphen separator', async function () {
      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/quotes', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 42 });

      await room.user.say('alice', '"This is a great quote" -- Famous Person');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.quote).to.equal('This is a great quote');
      expect(capturedBody.author).to.equal('Famous Person');
      expect(capturedBody.poster).to.equal('alice');
    });

    it('posts a quote with em-dash separator', async function () {
      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/quotes', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 43 });

      await room.user.say('alice', '"Another quote" — Some Author');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.quote).to.equal('Another quote');
      expect(capturedBody.author).to.equal('Some Author');
    });

    it('handles smart quotes (curly quotes)', async function () {
      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/quotes', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 44 });

      await room.user.say('alice', '"Smart quotes work" -- Author');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.quote).to.equal('Smart quotes work');
    });

    it('sends JSON content-type header', async function () {
      const scope = nock(TUMBLE_BASE, {
        reqheaders: {
          'content-type': 'application/json',
        },
      })
        .post('/api/v1/quotes')
        .reply(200, { id: 45 });

      await room.user.say('alice', '"Test quote" -- Author');
      await wait(100);

      expect(scope.isDone()).to.be.true;
    });

    it('uses id field from v1 API response', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/quotes').reply(200, {
        id: 12345,
        quote: 'Test',
        author: 'Someone',
      });

      await room.user.say('alice', '"Test" -- Someone');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('12345');
    });

    it('constructs permalink from base URL and id', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/quotes').reply(200, { id: 999 });

      await room.user.say('alice', '"Quote text" -- Author');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include(`${TUMBLE_BASE}/quote/999`);
    });

    it('handles API errors gracefully', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/quotes').reply(500, 'Server Error');

      await room.user.say('alice', '"Will fail" -- Author');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('Quote Failure');
    });

    it('handles malformed JSON response', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/quotes').reply(200, 'not json');

      await room.user.say('alice', '"Test" -- Author');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('unexpected response');
    });

    it('handles response without id field', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/quotes').reply(200, { quote: 'test' });

      await room.user.say('alice', '"Test" -- Author');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('unexpected response');
    });
  });

  describe('overheard quotes (OH:)', function () {
    it('posts an overheard quote without author', async function () {
      let capturedBody;
      const scope = nock(TUMBLE_BASE)
        .post('/api/v1/quotes', body => {
          capturedBody = body;
          return true;
        })
        .reply(200, { id: 100 });

      await room.user.say('alice', 'OH: Something funny I heard');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      expect(capturedBody.quote).to.equal('OH: Something funny I heard');
      expect(capturedBody.poster).to.equal('alice');
      expect(capturedBody.author).to.be.undefined;
    });

    it('is case insensitive', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/quotes').reply(200, { id: 101 });

      await room.user.say('alice', 'oh: lowercase works too');
      await wait(100);

      expect(scope.isDone()).to.be.true;
    });

    it('sends JSON content-type header', async function () {
      const scope = nock(TUMBLE_BASE, {
        reqheaders: {
          'content-type': 'application/json',
        },
      })
        .post('/api/v1/quotes')
        .reply(200, { id: 102 });

      await room.user.say('alice', 'OH: Test');
      await wait(100);

      expect(scope.isDone()).to.be.true;
    });

    it('uses id field from v1 API response', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/quotes').reply(200, { id: 54321 });

      await room.user.say('alice', 'OH: Something');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('54321');
    });

    it('handles API errors gracefully', async function () {
      const scope = nock(TUMBLE_BASE).post('/api/v1/quotes').reply(400, 'Bad Request');

      await room.user.say('alice', 'OH: Will fail');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('Quote Failure');
    });
  });
});
