// Test server to debug startup issues
require('dotenv').config();
const express = require('express');

console.log('Starting test server...');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Test server running' });
});

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
});
