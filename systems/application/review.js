module.exports = {
  name: 'review',
  perms: ['Moderator'],

  execute(msg, args, DB) {
    const list = DB.applications
      .filter(a => a.status === 'pending')
      .map(a => `<@${a.user}> - ${a.content}`)
      .join('\n') || 'none';

    msg.reply(list);
  }
};
