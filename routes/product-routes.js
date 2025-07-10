const express = require('express');
const router = express.Router();

const  { fetchProducts }  = require('../controllers/products-controller');

// Endpoint to get products
router.get('/get-products', fetchProducts);


module.exports = router;
