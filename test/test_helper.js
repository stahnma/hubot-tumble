const Helper = require('hubot-test-helper');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const nock = require('nock');

chai.use(sinonChai);
const expect = chai.expect;

// Default test configuration
const TUMBLE_BASE = 'http://tumble.test';

// Helper to set up environment for tests
const setupEnv = (overrides = {}) => {
  const defaults = {
    HUBOT_TUMBLE_BASEURL: TUMBLE_BASE,
    HUBOT_TUMBLE_API_KEY: 'test-api-key',
  };
  Object.assign(process.env, defaults, overrides);
};

// Helper to clean up environment after tests
const cleanupEnv = () => {
  delete process.env.HUBOT_TUMBLE_BASEURL;
  delete process.env.HUBOT_TUMBLE_API_KEY;
  delete process.env.HUBOT_TUMBLE_IRC_ADMIN_CHANNEL;
  delete process.env.DEBUG;
};

// Helper to wait for async operations
const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  Helper,
  expect,
  sinon,
  nock,
  TUMBLE_BASE,
  setupEnv,
  cleanupEnv,
  wait,
};
