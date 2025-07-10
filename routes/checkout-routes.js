const express = require('express');
const router = express.Router();

const  { createOrder, handleIPNCallback }  = require('../controllers/checkout-controller');

// Endpoint to get products
router.post('/place-order', createOrder);
router.get('/handle-ipn-callback', handleIPNCallback);


module.exports = router;