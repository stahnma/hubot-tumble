// Description:
//   Delete tumble quote entries via command or reaction
//   - Shell adapter: Direct delete with admin secret (no auth checks)
//   - IRC adapter: Control channel membership authorization
//   - Slack adapter: Admin authorization only (quotes don't track submitter)
//
// Configuration:
//   HUBOT_TUMBLE_BASEURL - The uri for the tumble server
//   HUBOT_TUMBLE_DELETE_SECRET - Admin secret for delete API calls
//                                (not required when BASEURL is localhost/127.0.0.1/::1)
//   HUBOT_TUMBLE_IRC_ADMIN_CHANNEL - IRC channel whose members can delete quotes
//                                    (e.g., #tumble-admins)
//
// Commands:
//   hubot tumble delete quote <id> - Delete a tumble quote by ID
//
// Notes:
//   On Slack, you can also react with 'x' emoji to delete a tumble quote
//   On IRC, only users in the admin channel can delete quotes
//   Unlike links, quotes don't track who submitted them, so only admins can delete
//
// Author:
//   stahnma

const env = process.env;

// Check if a URL points to localhost (no auth required for local dev)
const isLocalhost = urlString => {
  if (!urlString) return false;
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch (e) {
    return false;
  }
};

module.exports = robot => {
  const tumbleBase = env.HUBOT_TUMBLE_BASEURL;
  const deleteSecret = env.HUBOT_TUMBLE_DELETE_SECRET;
  const ircAdminChannel = env.HUBOT_TUMBLE_IRC_ADMIN_CHANNEL;
  const isLocal = isLocalhost(tumbleBase);

  // Helper to detect if we're running on Slack adapter
  const isSlack = () => {
    return robot.adapter && robot.adapter.options && robot.adapter.options.token;
  };

  // Helper to detect if we're running on IRC adapter
  const isIrc = () => {
    return robot.adapter && robot.adapter.bot && !isSlack();
  };

  // Check if a user is in the IRC admin channel
  const isIrcAdmin = nick => {
    if (!ircAdminChannel || !robot.adapter.bot) {
      return false;
    }
    const channel = robot.adapter.bot.chans[ircAdminChannel.toLowerCase()];
    if (!channel || !channel.users) {
      return false;
    }
    // Check if nick is in the channel (case-insensitive)
    const nickLower = nick.toLowerCase();
    return Object.keys(channel.users).some(user => user.toLowerCase() === nickLower);
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

  // Get quote metadata from Tumble API
  const getQuoteInfo = quoteId => {
    return new Promise((resolve, reject) => {
      robot.http(`${tumbleBase}/quote/${quoteId}.json`).get()((error, response, body) => {
        if (error) {
          reject(new Error(`HTTP error: ${error}`));
          return;
        }
        if (response.statusCode === 404) {
          reject(new Error('not_found'));
          return;
        }
        if (response.statusCode >= 400) {
          reject(new Error(`API error: ${response.statusCode}`));
          return;
        }
        try {
          const data = JSON.parse(body);
          resolve(data);
        } catch (parseError) {
          reject(new Error(`Parse error: ${parseError.message}`));
        }
      });
    });
  };

  // Delete quote via Tumble API
  const deleteTumbleQuote = quoteId => {
    return new Promise((resolve, reject) => {
      if (!deleteSecret && !isLocal) {
        reject(new Error('no_secret'));
        return;
      }
      let req = robot.http(`${tumbleBase}/quote/${quoteId}`);
      if (deleteSecret) {
        req = req.header('X-Admin-Secret', deleteSecret);
      }
      req.delete()((error, response, body) => {
        if (error) {
          reject(new Error(`HTTP error: ${error}`));
          return;
        }
        if (response.statusCode === 404) {
          reject(new Error('not_found'));
          return;
        }
        if (response.statusCode >= 400) {
          reject(new Error(`API error: ${response.statusCode}`));
          return;
        }
        resolve({ success: true });
      });
    });
  };

  // Check if Slack user is workspace admin
  const isSlackAdmin = async userId => {
    const slackClient = getSlackClient();
    if (!slackClient) {
      return false;
    }
    try {
      const result = await slackClient.users.info({ user: userId });
      return result.user?.is_admin === true || result.user?.is_owner === true;
    } catch (error) {
      robot.logger.error(`Failed to check admin status: ${error}`);
      return false;
    }
  };

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

  // Extract quote ID from a tumble message
  const extractQuoteId = text => {
    if (!text) return null;
    // Match patterns like "/quote/12345" or "quote|12345"
    const match = text.match(/\/quote\/(\d+)|quote\|(\d+)/);
    if (match) {
      return match[1] || match[2];
    }
    return null;
  };

  // Command handler: hubot tumble delete quote <id>
  robot.respond(/tumble delete quote (\d+)/i, async msg => {
    const quoteId = msg.match[1];
    const userId = msg.message.user.id;
    const userName = getUserName(msg);

    if (!deleteSecret && !isLocal) {
      msg.send('Delete functionality requires HUBOT_TUMBLE_DELETE_SECRET to be set.');
      return;
    }

    if (!tumbleBase) {
      msg.send('HUBOT_TUMBLE_BASEURL is not configured.');
      return;
    }

    try {
      // Non-Slack adapters
      if (!isSlack()) {
        // IRC adapter: check control channel membership
        if (isIrc()) {
          if (!ircAdminChannel) {
            msg.send('Delete functionality requires HUBOT_TUMBLE_IRC_ADMIN_CHANNEL to be set.');
            return;
          }
          if (!isIrcAdmin(userName)) {
            msg.send(`You must be in ${ircAdminChannel} to delete tumble quotes.`);
            return;
          }
          await deleteTumbleQuote(quoteId);
          msg.send(`Deleted tumble quote ${quoteId}.`);
          return;
        }

        // Shell adapter: direct delete without auth checks (for testing)
        await deleteTumbleQuote(quoteId);
        msg.send(`Deleted tumble quote ${quoteId}.`);
        return;
      }

      // Slack adapter: check admin authorization
      // Note: Unlike links, quotes don't track who submitted them,
      // so we can only allow admin deletion
      const isAdmin = await isSlackAdmin(userId);

      if (!isAdmin) {
        msg.send('Only workspace admins can delete quotes (quotes do not track the original submitter).');
        return;
      }

      await deleteTumbleQuote(quoteId);
      msg.send(`Deleted tumble quote ${quoteId} (as workspace admin).`);

      // Log to tumble-info channel
      if (msg.message.rawMessage) {
        const linkToMessage =
          'https://stahnma.slack.com/archives/' +
          msg.message.rawMessage.channel +
          '/p' +
          msg.message.rawMessage.ts.replace(/\./, '');

        const logMsg = {
          text:
            `Tumble quote <${tumbleBase}/quote/${quoteId}|${quoteId}> deleted by <@${userId}> (admin) ` +
            `(<${linkToMessage}|slack archive>)`,
          unfurl_links: false,
        };
        robot.messageRoom('tumble-info', logMsg);
      }
    } catch (error) {
      if (error.message === 'not_found') {
        msg.send(`Quote ${quoteId} not found.`);
      } else if (error.message === 'no_secret') {
        msg.send('Delete functionality requires HUBOT_TUMBLE_DELETE_SECRET to be set.');
      } else {
        robot.logger.error(`Failed to delete tumble quote: ${error}`);
        msg.send(`Failed to delete quote ${quoteId}: ${error.message}`);
      }
    }
  });

  // Reaction handler (Slack-only)
  if (!isSlack()) {
    robot.logger.info('delete_quote: Skipping reaction handler (not on Slack adapter)');
    return;
  }

  if (typeof robot.react !== 'function') {
    robot.logger.warning('delete_quote: robot.react not available, skipping');
    return;
  }

  const handleReaction = async res => {
    const message = res.message;
    const item = message.item;

    // Only handle 'x' emoji reactions on messages
    if (item.type !== 'message' || message.type !== 'added' || message.reaction !== 'x') {
      return;
    }

    const slackClient = getSlackClient();
    if (!slackClient) {
      robot.logger.error('delete_quote: No Slack client available');
      return;
    }

    const userId = message.user.id;

    try {
      // Get the message that was reacted to
      const result = await slackClient.conversations.history({
        channel: item.channel,
        limit: 1,
        inclusive: true,
        oldest: item.ts,
        latest: item.ts,
      });

      if (!result.messages || !result.messages[0]) {
        robot.logger.warning('delete_quote: Could not find reacted message');
        return;
      }

      const reactedMessage = result.messages[0];
      const quoteId = extractQuoteId(reactedMessage.text);

      if (!quoteId) {
        // Not a tumble quote message, ignore silently
        return;
      }

      if (!deleteSecret && !isLocal) {
        await slackClient.chat.postEphemeral({
          channel: item.channel,
          user: userId,
          text: 'Delete functionality requires HUBOT_TUMBLE_DELETE_SECRET to be set.',
        });
        return;
      }

      // Check admin authorization (quotes don't track submitter)
      const isAdmin = await isSlackAdmin(userId);

      if (!isAdmin) {
        await slackClient.chat.postEphemeral({
          channel: item.channel,
          user: userId,
          text: 'Only workspace admins can delete quotes (quotes do not track the original submitter).',
        });
        return;
      }

      // Delete the quote
      await deleteTumbleQuote(quoteId);

      // Add checkmark reaction to indicate success
      try {
        await slackClient.reactions.add({
          name: 'white_check_mark',
          channel: item.channel,
          timestamp: item.ts,
        });
      } catch (e) {
        // Ignore if reaction already exists
      }

      // Log to tumble-info channel
      const linkToMessage =
        'https://stahnma.slack.com/archives/' + item.channel + '/p' + item.ts.replace(/\./, '');

      const logMsg = {
        text:
          `Tumble quote <${tumbleBase}/quote/${quoteId}|${quoteId}> deleted via :x: reaction by <@${userId}> (admin) ` +
          `(<${linkToMessage}|slack archive>)`,
        unfurl_links: false,
      };
      robot.messageRoom('tumble-info', logMsg);

      robot.logger.info(`Deleted tumble quote ${quoteId} via reaction by admin`);
    } catch (error) {
      robot.logger.error(`Failed to handle delete quote reaction: ${error}`);

      if (error.message === 'not_found') {
        try {
          await slackClient.chat.postEphemeral({
            channel: item.channel,
            user: userId,
            text: `Quote not found.`,
          });
        } catch (e) {
          // Ignore ephemeral message failures
        }
      }
    }
  };

  robot.react(handleReaction);
};
