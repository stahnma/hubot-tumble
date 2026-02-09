const { Helper, expect, nock, TUMBLE_BASE, setupEnv, cleanupEnv, wait } = require('./test_helper');

// Note: Environment variables are read at module load time.
// hubot-test-helper caches modules, so we test the main configuration here.

describe('ping', function () {
  // Set up default env before any helper is created
  before(function () {
    setupEnv();
  });

  after(function () {
    cleanupEnv();
  });

  const helper = new Helper('../src/ping.js');
  let room;

  beforeEach(function () {
    room = helper.createRoom();
    nock.cleanAll();
  });

  afterEach(function () {
    room.destroy();
    nock.cleanAll();
  });

  describe('tumble ping command', function () {
    it('reports HUBOT_TUMBLE_BASEURL when configured', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').reply(200, {
        info: { title: 'Tumble API', version: '1.0.0' },
      });

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('HUBOT_TUMBLE_BASEURL');
      expect(response[1]).to.include(TUMBLE_BASE);
    });

    it('reports HUBOT_TUMBLE_API_KEY status when configured', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').reply(200, {
        info: { title: 'Tumble API', version: '1.0.0' },
      });

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('HUBOT_TUMBLE_API_KEY: configured');
    });

    it('detects Shell adapter', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').reply(200, {
        info: { title: 'Tumble API', version: '1.0.0' },
      });

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('Adapter: Shell');
    });

    it('verifies tumble server connectivity and shows version', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').reply(200, {
        info: { title: 'Tumble API', version: '2.0.0' },
      });

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('Tumble server: OK');
      expect(response[1]).to.include('v2.0.0');
    });

    it('reports server not identified as tumble', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').reply(200, {
        info: { title: 'Some Other API', version: '1.0.0' },
      });

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('not_tumble');
    });

    it('reports connection errors', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').replyWithError('Connection refused');

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('FAILED');
      expect(response[1]).to.include('connection_error');
    });

    it('reports 404 as not tumble', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').reply(404, 'Not Found');

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('not_tumble');
    });

    it('reports server errors', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').reply(500, 'Internal Server Error');

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('server_error');
    });

    it('reports all checks passed when everything works', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').reply(200, {
        info: { title: 'Tumble API', version: '1.0.0' },
      });

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('All checks passed');
    });

    it('reports some checks failed when server is down', async function () {
      const scope = nock(TUMBLE_BASE).get('/api/openapi.json').reply(500, 'Error');

      await room.user.say('alice', '@hubot tumble ping');
      await wait(100);

      expect(scope.isDone()).to.be.true;
      const response = room.messages.find(m => m[0] === 'hubot');
      expect(response[1]).to.include('Some checks failed');
    });
  });
});
