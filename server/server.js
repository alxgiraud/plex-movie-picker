const express = require('express');
const { router: apiRoutes } = require('./routes/api.js');
const path = require('path');

const hostname = '0.0.0.0'; //update with local IP if needed
const port = 3000;

const app = express();

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());


app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
