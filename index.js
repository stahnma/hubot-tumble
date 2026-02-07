'use strict'

const path = require('path')

module.exports = (robot) => {
  const scriptsPath = path.resolve(__dirname, 'src')
  console.log('[hubot-tumble] Loading scripts from', scriptsPath)
  try {
    robot.loadFile(scriptsPath, 'links.js')
    console.log('[hubot-tumble] Loaded links.js')
  } catch (e) {
    console.error('[hubot-tumble] Failed to load links.js:', e)
  }
  try {
    robot.loadFile(scriptsPath, 'quotes.js')
    console.log('[hubot-tumble] Loaded quotes.js')
  } catch (e) {
    console.error('[hubot-tumble] Failed to load quotes.js:', e)
  }
  try {
    robot.loadFile(scriptsPath, 'delete_tumble.js')
    console.log('[hubot-tumble] Loaded delete_tumble.js')
  } catch (e) {
    console.error('[hubot-tumble] Failed to load delete_tumble.js:', e)
  }
  try {
    robot.loadFile(scriptsPath, 'ping.js')
    console.log('[hubot-tumble] Loaded ping.js')
  } catch (e) {
    console.error('[hubot-tumble] Failed to load ping.js:', e)
  }
  try {
    robot.loadFile(scriptsPath, 'delete_quote.js')
    console.log('[hubot-tumble] Loaded delete_quote.js')
  } catch (e) {
    console.error('[hubot-tumble] Failed to load delete_quote.js:', e)
  }
}
