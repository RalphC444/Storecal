const { MongoClient } = require("mongodb");

let _client = null;
let _db = null;

async function getDb() {
  if (_db) return _db;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI not set in .env");
  _client = new MongoClient(process.env.MONGODB_URI);
  await _client.connect();
  _db = _client.db();
  return _db;
}

module.exports = { getDb };
