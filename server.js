const express = require('express');
const path = require('path');
const app = express();
const productRoutes = require('./routes/product-routes');
const PORT = 4000;


app.use(express.static(path.join(__dirname, 'public')));


// Endpoint to get products
app.use('/fetch', productRoutes);

app.get('/awake', (req, res) => {
  res.send('System Awoken');
});

// Serve index.html for the main site
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve admin.html for the admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
