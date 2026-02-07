// Description
//    Tumble Client - Quote Handler
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

const QS = require('querystring');
const { shouldIgnoreMessage } = require('./utils');

const env = process.env;
const tumble_base = env.HUBOT_TUMBLE_BASEURL;

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

  // Tumble quotes:
  // Matches: "quote text" -- author  or  "quote text" — author
  robot.hear(/^\s*(\"|")(.+?)(\"|")\s+(--|—)\s*(.+?)$/, msg => {
    // Skip messages from the bot or quoting the bot
    if (shouldIgnoreMessage(robot, msg)) {
      return;
    }

    const room = msg.message.room;
    const said = msg.message.text;
    let words;

    // this is two hyphens
    if (/--/.test(said)) {
      words = said.split('--');
    }
    // this is em-dash
    if (/—/.test(said)) {
      words = said.split('—');
    }

    let quote = words[0].trim();
    const author = words[1].trim();

    // Remove the quotation marks themselves from the string
    quote = quote.substring(1, quote.length - 1);

    const data = QS.stringify({ quote: quote, author: author });

    msg
      .http(tumble_base)
      .path('/quote/')
      .header('Content-Type', 'application/x-www-form-urlencoded')
      .post(data)((error, response, body) => {
      if (error || (response && response.statusCode >= 400)) {
        msg.send(`Quote Failure: ${error || response?.statusCode}`);
        return;
      }

      // API returns permalink URL as plain text (e.g., http://example.com/quote/42)
      const permalink = body.trim();
      // Extract quote ID from permalink URL
      const idMatch = permalink.match(/\/quote\/(\d+)/);
      const quoteId = idMatch ? idMatch[1] : null;

      if (!permalink || !quoteId) {
        msg.send(`Quote may not have been saved - unexpected response: ${body}`);
        robot.logger.warning(`Tumble quote response unexpected: ${body}`);
        return;
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
            '|tumble> quote <' +
            permalink +
            '|' +
            quoteId +
            '> posted from <#' +
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
              name: 'speech_balloon',
              channel: msg.message.rawMessage.channel,
              timestamp: msg.message.rawMessage.ts,
            })
            .catch(err => {
              robot.logger.warning(`Failed to add reaction: ${err}`);
            });
        }
      } else {
        // Simple acknowledgment for non-Slack adapters
        msg.send(`Quote Added: ${permalink}`);
      }
    });
  });
};
