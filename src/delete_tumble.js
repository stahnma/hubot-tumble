// Description:
//   Demonstrates how to use the hubot-slack v4.1.0 ReactionMessage

function handleReaction(res) {
  const message = res.message;
  const item = message.item;
  let desc;

  switch (item.type) {
    case 'message':
      desc = `the message from channel ${item.channel} at time ${item.ts}`;
      break;
    case 'file':
      desc = `the file with ID ${item.file}`;
      break;
    case 'file_comment':
      desc = `the comment with ID ${item.file_comment} for file ${item.file}`;
      break;
    default:
      desc = `an item of type ${item.type} that I don't recognize`;
  }

  const type = message.type;
  const user = `${message.user.real_name} (@${message.user.name})`;
  const reaction = message.reaction;
  const preposition = type === 'added' ? 'to' : 'from';
  res.reply(`${user} ${type} a *${reaction}* reaction ${preposition} ${desc}.`);
}

module.exports = (robot) => {
  const handleAnotherReaction = (res) => {
    const message = res.message;
    const item = message.item;

    if (item.type === 'message' && message.type === 'added' && message.reaction === 'x') {
      robot.adapter.client.web.conversations
        .history(item.channel, { limit: 1, inclusive: true, oldest: item.ts })
        .then((result) => {
          console.log(result.messages[0].text);
        })
        .catch((error) => {
          console.log(error);
        });
    }
  };

  robot.react(handleAnotherReaction);
};
