// Description
//    Tumble Client
//
// Dependencies:
//    Having Tumble installed somewhere
//
// Configuration:
//    HUBOT_TUMBLE_BASEURL - The uri for the tumble server
//    HUBOT_TUMBLE_ROOMS - List of rooms for which tumble behavior should be
//      enabled. (Comma separated names).
//
// Commands:
//    None
//
//  Examples:
//    HUBOT_TUMBLE_BASEURL=http://tumble.delivery.puppetlabs.net
//    HUBOT_TUMBLE_ROOMS=delivery,eso-team,release-new
//
// Author:
//  stahnma

const { format } = require('timeago.js');
const { shouldIgnoreMessage } = require('./utils');

const env = process.env;
const DEBUG = env.DEBUG === '1' || env.DEBUG === 'true';

// Debug logger that only outputs when DEBUG is enabled
const debug = message => {
  if (DEBUG) {
    console.log(`[tumble-debug] ${message}`);
  }
};

module.exports = robot => {
  // Helper to detect if we're running on Slack adapter
  const isSlack = () => {
    return robot.adapter && robot.adapter.options && robot.adapter.options.token;
  };

  // Lazy-load WebClient only when on Slack
  let web = null;
  const getSlackClient = () => {
    if (!web && isSlack()) {
      const { WebClient } = require('@slack/client');
      web = new WebClient(robot.adapter.options.token);
    }
    return web;
  };

  if (!env.HUBOT_TUMBLE_BASEURL) {
    robot.logger.error('The HUBOT_TUMBLE_BASEURL environment variable not set');
  }

  const tumble_base = env.HUBOT_TUMBLE_BASEURL;
  robot.logger.info('Tumble base is ' + tumble_base);

  // Helper to get user display name, works across adapters
  const getUserName = msg => {
    const userId = msg.message.user.id;
    const room = msg.message.room;

    // Try Slack-specific user data first
    try {
      const slackProfile = robot.brain.data.users[userId]?.slack?.profile;
      if (slackProfile?.display_name) {
        return slackProfile.display_name;
      }
    } catch (e) {
      // Not on Slack or no Slack profile data
    }

    // Fallback to standard hubot user name
    if (msg.message.user.name) {
      return msg.message.user.name;
    }

    // Shell adapter fallback
    if (room === 'Shell') {
      return 'shell-tester';
    }

    return 'unknown';
  };

  // Process a tumble link
  robot.hear(/http:\/\/|https:\/\//i, msg => {
    // Skip messages from the bot or quoting the bot
    if (shouldIgnoreMessage(robot, msg)) {
      debug('Ignoring message from/quoting bot');
      return;
    }

    const room = msg.message.room;
    const user = getUserName(msg);

    const said = msg.message.text;
    const words = said.split(/\s+/);
    let url;

    for (const w of words) {
      if (w.match(/http:\/\/|https:\/\//)) {
        // Skip links prefixed with ! (escape character to prevent posting)
        if (w.startsWith('!')) {
          continue;
        }
        url = w;
      }
    }

    if (!url) {
      return;
    }

    // Exclude putting zoom links on the aggregator
    if (url.match(/zoom\.us/)) {
      return;
    }

    // Function to post the link to tumble
    const postLinkToTumble = channelName => {
      const data = JSON.stringify({ url: url, user: user });
      try {
        msg
          .http(tumble_base)
          .path('/api/v1/links')
          .header('Content-Type', 'application/json')
          .post(data)((error, response, body) => {
          if (error || (response && response.statusCode >= 400)) {
            console.log(`Something went wrong posting to tumble. ${url}`);
            console.log(`Error: ${error}, Status: ${response?.statusCode}`);
            msg.send(`Failed to post link to tumble: ${error || response?.statusCode}`);
            return;
          }

          // Parse JSON response from API
          let result;
          let linkId;
          let tumbleLink;
          try {
            result = JSON.parse(body);
            linkId = result.id;
            tumbleLink = `${tumble_base}/link/${linkId}`;
            debug(`Tumble API response: ${JSON.stringify(result)}`);
          } catch (parseError) {
            console.log(`Failed to parse tumble response: ${parseError}`);
            msg.send(`Failed to parse tumble response`);
            return;
          }

          // Check if this is a duplicate link
          if (
            result.is_duplicate &&
            result.previous_submissions &&
            result.previous_submissions.length > 0
          ) {
            const originalSubmission = result.previous_submissions[0];
            const timeAgo = format(originalSubmission.created_at);
            debug(`Duplicate detected, original posted: ${originalSubmission.created_at}`);
            msg.send(`Welcome to ${timeAgo}.`);
          }

          // Slack-enhanced acknowledgment
          if (isSlack() && msg.message.rawMessage) {
            const link_to_message =
              'https://stahnma.slack.com/archives/' +
              msg.message.rawMessage.channel +
              '/p' +
              msg.message.rawMessage.ts.replace(/\./, '');

            const ack = {
              text:
                '<' +
                tumble_base +
                '|tumble> link <' +
                tumbleLink +
                '|' +
                linkId +
                '> posted in <#' +
                msg.message.rawMessage.channel +
                '> by <@' +
                msg.message.user.id +
                '> (<' +
                link_to_message +
                '|slack archive>)',
              unfurl_links: false,
            };

            robot.messageRoom('tumble-info', ack);

            // Post emoji reaction
            const slackClient = getSlackClient();
            if (slackClient) {
              slackClient.reactions
                .add({
                  name: 'fish',
                  channel: msg.message.rawMessage.channel,
                  timestamp: msg.message.rawMessage.ts,
                })
                .catch(err => {
                  robot.logger.warning(`Failed to add reaction: ${err}`);
                });
            }
          } else {
            // Simple acknowledgment for non-Slack adapters
            msg.send(`Tumble link posted: ${tumbleLink} (id: ${linkId})`);
          }
        });
      } catch (error) {
        msg.send('Something went wrong posting to tumble');
        console.log(`Something went wrong posting to tumble. ${url}`);
        console.log(`Error is ${error}`);
      }
    };

    // If on Slack, get the channel name from the API for richer data
    if (isSlack() && msg.message.rawMessage?.channel) {
      const slackClient = getSlackClient();
      if (slackClient) {
        slackClient.conversations
          .info({ channel: msg.message.rawMessage.channel })
          .then(channelobject => {
            const channelName = channelobject.channel.name_normalized;
            postLinkToTumble(channelName);
          })
          .catch(err => {
            robot.logger.warning(`Failed to get channel info: ${err}`);
            // Fallback to room name
            postLinkToTumble(room);
          });
        return;
      }
    }

    // For non-Slack adapters, use the room name directly
    postLinkToTumble(room);
  });
};
