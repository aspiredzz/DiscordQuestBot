function log(type, msg) {
  console.log(`[${type.toUpperCase()}] ${new Date().toISOString()} - ${msg}`);
}

module.exports = { log };
