// Description:
//   Delete tumble entries via command or reaction
//   - Shell adapter: Direct delete with admin secret (no auth checks)
//   - IRC adapter: Control channel membership authorization
//   - Slack adapter: Time-based (5 min) + admin authorization
//
// Configuration:
//   HUBOT_TUMBLE_BASEURL - The uri for the tumble server
//   HUBOT_TUMBLE_DELETE_SECRET - Admin secret for delete API calls
//                                (not required when BASEURL is localhost/127.0.0.1/::1)
//   HUBOT_TUMBLE_IRC_ADMIN_CHANNEL - IRC channel whose members can delete links
//                                    (e.g., #tumble-admins)
//
// Commands:
//   hubot tumble delete <id> - Delete a tumble link by ID
//
// Notes:
//   On Slack, you can also react with 'x' emoji to delete a tumble link
//   On IRC, only users in the admin channel can delete links
//
// Author:
//   stahnma

const env = process.env;
const DELETE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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

  // Get link metadata from Tumble API
  const getLinkInfo = linkId => {
    return new Promise((resolve, reject) => {
      robot.http(`${tumbleBase}/link/${linkId}.json`).get()((error, response, body) => {
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

  // Delete link via Tumble API
  const deleteTumbleLink = linkId => {
    return new Promise((resolve, reject) => {
      if (!deleteSecret && !isLocal) {
        reject(new Error('no_secret'));
        return;
      }
      let req = robot.http(`${tumbleBase}/link/${linkId}`);
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

  // Get user display name from link info user field or message
  const normalizeUsername = name => {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  // Authorization check combining time window + admin status
  const canDeleteLink = async (linkInfo, requestingUserId, requestingUserName) => {
    const linkUser = linkInfo.user || '';
    const linkTimestamp = linkInfo.timestamp ? new Date(linkInfo.timestamp).getTime() : 0;
    const now = Date.now();
    const ageMs = now - linkTimestamp;

    // Normalize usernames for comparison
    const normalizedLinkUser = normalizeUsername(linkUser);
    const normalizedRequestingUser = normalizeUsername(requestingUserName);

    const isOwner = normalizedLinkUser === normalizedRequestingUser;
    const withinWindow = ageMs <= DELETE_WINDOW_MS;

    // Owner within time window can always delete
    if (isOwner && withinWindow) {
      return { allowed: true, reason: 'own_link' };
    }

    // Check if user is Slack admin
    if (isSlack()) {
      const isAdmin = await isSlackAdmin(requestingUserId);
      if (isAdmin) {
        return { allowed: true, reason: 'admin' };
      }
    }

    // Denied - provide appropriate message
    if (isOwner && !withinWindow) {
      const ageMinutes = Math.floor(ageMs / 60000);
      return {
        allowed: false,
        reason: 'time_expired',
        message: `You can only delete your own links within 5 minutes of posting. This link was posted ${ageMinutes} minutes ago.`,
      };
    }

    return {
      allowed: false,
      reason: 'not_owner',
      message: `Only ${linkUser} or a workspace admin can delete this link.`,
    };
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

  // Extract link ID from a tumble message
  const extractLinkId = text => {
    if (!text) return null;
    // Match patterns like "id=12345" or "/link/?id=12345"
    const match = text.match(/id=(\d+)/);
    return match ? match[1] : null;
  };

  // Command handler: hubot tumble delete <id>
  robot.respond(/tumble delete (\d+)/i, async msg => {
    const linkId = msg.match[1];
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
            msg.send(`You must be in ${ircAdminChannel} to delete tumble links.`);
            return;
          }
          await deleteTumbleLink(linkId);
          msg.send(`Deleted tumble link ${linkId}.`);
          return;
        }

        // Shell adapter: direct delete without auth checks (for testing)
        await deleteTumbleLink(linkId);
        msg.send(`Deleted tumble link ${linkId}.`);
        return;
      }

      // Slack adapter: check authorization
      const linkInfo = await getLinkInfo(linkId);
      const authResult = await canDeleteLink(linkInfo, userId, userName);

      if (!authResult.allowed) {
        msg.send(authResult.message);
        return;
      }

      await deleteTumbleLink(linkId);

      const reasonText = authResult.reason === 'admin' ? 'as workspace admin' : 'own link';
      msg.send(`Deleted tumble link ${linkId} (${reasonText}).`);

      // Log to tumble-info channel
      if (msg.message.rawMessage) {
        const slackClient = getSlackClient();
        const linkToMessage =
          'https://stahnma.slack.com/archives/' +
          msg.message.rawMessage.channel +
          '/p' +
          msg.message.rawMessage.ts.replace(/\./, '');

        const logMsg = {
          text:
            `Tumble link <${tumbleBase}/link/?id=${linkId}|${linkId}> deleted by <@${userId}> (${reasonText}) ` +
            `(<${linkToMessage}|slack archive>)`,
          unfurl_links: false,
        };
        robot.messageRoom('tumble-info', logMsg);
      }
    } catch (error) {
      if (error.message === 'not_found') {
        msg.send(`Link ${linkId} not found.`);
      } else if (error.message === 'no_secret') {
        msg.send('Delete functionality requires HUBOT_TUMBLE_DELETE_SECRET to be set.');
      } else {
        robot.logger.error(`Failed to delete tumble link: ${error}`);
        msg.send(`Failed to delete link ${linkId}: ${error.message}`);
      }
    }
  });

  // Reaction handler (Slack-only)
  if (!isSlack()) {
    robot.logger.info('delete_tumble: Skipping reaction handler (not on Slack adapter)');
    return;
  }

  if (typeof robot.react !== 'function') {
    robot.logger.warning('delete_tumble: robot.react not available, skipping');
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
      robot.logger.error('delete_tumble: No Slack client available');
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
        robot.logger.warning('delete_tumble: Could not find reacted message');
        return;
      }

      const reactedMessage = result.messages[0];
      const linkId = extractLinkId(reactedMessage.text);

      if (!linkId) {
        // Not a tumble link message, ignore silently
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

      // Get user info for authorization
      let userName = 'unknown';
      try {
        const userInfo = await slackClient.users.info({ user: userId });
        userName = userInfo.user?.profile?.display_name || userInfo.user?.name || 'unknown';
      } catch (e) {
        robot.logger.warning(`Failed to get user info: ${e}`);
      }

      // Check authorization
      const linkInfo = await getLinkInfo(linkId);
      const authResult = await canDeleteLink(linkInfo, userId, userName);

      if (!authResult.allowed) {
        await slackClient.chat.postEphemeral({
          channel: item.channel,
          user: userId,
          text: authResult.message,
        });
        return;
      }

      // Delete the link
      await deleteTumbleLink(linkId);

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
      const reasonText = authResult.reason === 'admin' ? 'as workspace admin' : 'own link';
      const linkToMessage =
        'https://stahnma.slack.com/archives/' + item.channel + '/p' + item.ts.replace(/\./, '');

      const logMsg = {
        text:
          `Tumble link <${tumbleBase}/link/?id=${linkId}|${linkId}> deleted via :x: reaction by <@${userId}> (${reasonText}) ` +
          `(<${linkToMessage}|slack archive>)`,
        unfurl_links: false,
      };
      robot.messageRoom('tumble-info', logMsg);

      robot.logger.info(`Deleted tumble link ${linkId} via reaction by ${userName}`);
    } catch (error) {
      robot.logger.error(`Failed to handle delete reaction: ${error}`);

      if (error.message === 'not_found') {
        try {
          await slackClient.chat.postEphemeral({
            channel: item.channel,
            user: userId,
            text: `Link not found.`,
          });
        } catch (e) {
          // Ignore ephemeral message failures
        }
      }
    }
  };

  robot.react(handleReaction);
};
