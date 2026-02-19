// Description
//    Shared utilities for hubot-tumble
//
// Author:
//  stahnma

/**
 * Returns an array of all names/identifiers the bot responds to.
 * Includes the robot's name and alias (if configured).
 */
const getBotIdentifiers = robot => {
  const identifiers = [];

  // Add robot name (always present)
  if (robot.name) {
    identifiers.push(robot.name.toLowerCase());
  }

  // Add alias if configured (can be different from name)
  if (robot.alias && robot.alias.toLowerCase() !== robot.name?.toLowerCase()) {
    identifiers.push(robot.alias.toLowerCase());
  }

  return identifiers;
};

/**
 * Checks if a message is from the bot itself.
 * Compares the message author against known bot identifiers.
 */
const isFromBot = (robot, msg) => {
  const userName = msg.message.user?.name?.toLowerCase();
  if (!userName) return false;

  const identifiers = getBotIdentifiers(robot);

  for (const id of identifiers) {
    if (userName === id) {
      return true;
    }
  }

  return false;
};

/**
 * Checks if a message appears to be quoting or referencing the bot.
 * Detects patterns like:
 *   - "> botname: message" (quote format)
 *   - "botname: message" (attribution)
 *   - Lines starting with the bot's name followed by punctuation
 */
const isQuotingBot = (robot, msg) => {
  const text = msg.message.text?.toLowerCase() || '';
  const identifiers = getBotIdentifiers(robot);

  for (const id of identifiers) {
    // Check for common quote/attribution patterns:
    // - "> botname" (Slack/IRC block quote)
    // - "botname:" at start of message
    // - "botname said" patterns
    if (
      text.startsWith(`> ${id}`) ||
      text.startsWith(`${id}:`) ||
      text.startsWith(`${id} :`) ||
      text.startsWith(`${id} said`) ||
      text.startsWith(`${id} posted`)
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Combined check: returns true if the message should be ignored
 * because it's from the bot or quoting the bot.
 */
const shouldIgnoreMessage = (robot, msg) => {
  return isFromBot(robot, msg) || isQuotingBot(robot, msg);
};

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
  if (result.url) {
    robot._tumbleSlackUrl = result.url.replace(/\/$/, '');
  }
  robot.logger.info(`tumble: Slack team ID resolved: ${result.team_id}`);
};

module.exports = {
  getBotIdentifiers,
  isFromBot,
  isQuotingBot,
  shouldIgnoreMessage,
  isSlack,
  isIrc,
  getClientMetadata,
  ensureSlackTeamId,
};
