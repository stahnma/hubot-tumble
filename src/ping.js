// Description:
//   Status check for tumble configuration and connectivity
//
// Configuration:
//   HUBOT_TUMBLE_BASEURL - The uri for the tumble server
//   HUBOT_TUMBLE_API_KEY - API key for authenticated API calls
//
// Commands:
//   hubot tumble ping - Check tumble configuration and connectivity
//
// Author:
//   stahnma

const env = process.env;

// Check if a URL points to localhost
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
  const apiKey = env.HUBOT_TUMBLE_API_KEY;
  const ircAdminChannel = env.HUBOT_TUMBLE_IRC_ADMIN_CHANNEL;
  const ircNetwork = env.HUBOT_TUMBLE_IRC_NETWORK;
  const isLocal = isLocalhost(tumbleBase);

  // Helper to detect adapter type
  const getAdapterType = () => {
    if (robot.adapter?.options?.token) {
      return 'Slack';
    }
    if (robot.adapter?.bot && !robot.adapter?.options?.token) {
      return 'IRC';
    }
    return 'Shell';
  };

  // Ping the tumble server and verify it's actually Tumble
  const pingTumble = () => {
    return new Promise((resolve, reject) => {
      if (!tumbleBase) {
        reject(new Error('not_configured'));
        return;
      }

      const startTime = Date.now();
      robot.http(`${tumbleBase}/api/openapi.json`).get()((error, response, body) => {
        const elapsed = Date.now() - startTime;
        if (error) {
          reject(new Error(`connection_error: ${error.message || error}`));
          return;
        }
        if (response.statusCode === 404) {
          reject(new Error('not_tumble: OpenAPI spec not found'));
          return;
        }
        if (response.statusCode >= 500) {
          reject(new Error(`server_error: ${response.statusCode}`));
          return;
        }
        if (response.statusCode >= 400) {
          reject(new Error(`http_error: ${response.statusCode}`));
          return;
        }

        // Verify it's a Tumble server by checking the OpenAPI spec
        try {
          const spec = JSON.parse(body);
          const title = (spec.info?.title || '').toLowerCase();
          if (!title.includes('tumble')) {
            reject(new Error('not_tumble: server does not identify as Tumble'));
            return;
          }
          resolve({ statusCode: response.statusCode, elapsed, version: spec.info?.version });
        } catch (parseError) {
          reject(new Error('not_tumble: invalid OpenAPI response'));
        }
      });
    });
  };

  robot.respond(/tumble ping$/i, async msg => {
    const checks = [];
    let allPassed = true;

    // Check 1: HUBOT_TUMBLE_BASEURL
    if (tumbleBase) {
      checks.push(`HUBOT_TUMBLE_BASEURL: ${tumbleBase}`);
    } else {
      checks.push('HUBOT_TUMBLE_BASEURL: not set');
      allPassed = false;
    }

    // Check 2: HUBOT_TUMBLE_API_KEY
    if (apiKey) {
      checks.push('HUBOT_TUMBLE_API_KEY: configured');
    } else if (isLocal) {
      checks.push('HUBOT_TUMBLE_API_KEY: not set (not required for localhost)');
    } else {
      checks.push('HUBOT_TUMBLE_API_KEY: not set (authenticated operations will not work)');
    }

    // Check 3: IRC admin channel (only relevant for IRC)
    const adapterType = getAdapterType();
    if (adapterType === 'IRC') {
      if (ircAdminChannel) {
        checks.push(`HUBOT_TUMBLE_IRC_ADMIN_CHANNEL: ${ircAdminChannel}`);
      } else {
        checks.push('HUBOT_TUMBLE_IRC_ADMIN_CHANNEL: not set (IRC deletes will not work)');
      }
      if (ircNetwork) {
        checks.push(`HUBOT_TUMBLE_IRC_NETWORK: ${ircNetwork}`);
      } else {
        checks.push('HUBOT_TUMBLE_IRC_NETWORK: not set (client_network will be null)');
      }
    }

    // Check 4: Slack team ID (only relevant for Slack)
    if (adapterType === 'Slack') {
      const teamId = robot._tumbleSlackTeamId || env.HUBOT_TUMBLE_SLACK_TEAM_ID;
      if (teamId) {
        checks.push(`Slack team ID: ${teamId}`);
      } else {
        checks.push('Slack team ID: not resolved (client_network will be null)');
      }
    }

    // Check 5: Adapter type
    checks.push(`Adapter: ${adapterType}`);

    // Check 5: Server connectivity and Tumble verification
    if (tumbleBase) {
      try {
        const result = await pingTumble();
        const versionInfo = result.version ? `, v${result.version}` : '';
        checks.push(`Tumble server: OK (${result.elapsed}ms${versionInfo})`);
      } catch (error) {
        if (error.message === 'not_configured') {
          checks.push('Tumble server: skipped (no base URL)');
        } else {
          checks.push(`Tumble server: FAILED (${error.message})`);
          allPassed = false;
        }
      }
    } else {
      checks.push('Tumble server: skipped (no base URL)');
    }

    // Build response
    const status = allPassed ? 'All checks passed' : 'Some checks failed';
    const response = `Tumble Status: ${status}\n${checks.map(c => `  - ${c}`).join('\n')}`;

    msg.send(response);
  });
};
