module.exports = {
  name: 'staffnote',
  perms: ['Moderator'],

  execute(msg, args, DB, save) {
    DB.staffNotes.push({
      staff: msg.author.id,
      note: args.join(' ')
    });

    save(DB);
    msg.reply('note saved');
  }
};
