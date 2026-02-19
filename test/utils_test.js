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
