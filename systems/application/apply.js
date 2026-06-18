module.exports = {
  name: 'apply',
  perms: [],

  execute(msg, args, DB, save) {
    DB.applications.push({
      id: Date.now().toString(),
      user: msg.author.id,
      content: args.join(' '),
      status: 'pending'
    });

    save(DB);
    msg.reply('application sent');
  }
};
