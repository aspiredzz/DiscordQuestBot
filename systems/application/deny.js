module.exports = {
  name: 'deny',
  perms: ['Administrator'],

  execute(msg, args, DB, save) {
    const app = DB.applications.find(a => a.user === args[0]);
    if (!app) return msg.reply('not found');

    app.status = 'denied';
    save(DB);

    msg.reply('denied');
  }
};
