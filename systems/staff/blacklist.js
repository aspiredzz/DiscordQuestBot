module.exports = {
  name: 'blacklist',
  perms: ['Administrator'],

  execute(msg, args, DB, save) {
    DB.blacklist.push(args[0]);
    save(DB);

    msg.reply('blacklisted');
  }
};
