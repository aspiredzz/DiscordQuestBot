const crypto = require('crypto');

module.exports = {
  name: 'ticket',
  perms: [],

  execute(msg, args, DB, save) {
    DB.tickets.push({
      id: crypto.randomUUID(),
      user: msg.author.id,
      reason: args.join(' ')
    });

    save(DB);
    msg.reply('ticket created');
  }
};
