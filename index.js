'use strict'

const path = require('path')

module.exports = (robot) => {
  const scriptsPath = path.resolve(__dirname, 'src')
  robot.loadFile(scriptsPath, 'links.js')
  robot.loadFile(scriptsPath, 'quotes.js')
  robot.loadFile(scriptsPath, 'delete_tumble.js')
}
