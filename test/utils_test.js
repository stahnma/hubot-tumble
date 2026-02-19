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
});
