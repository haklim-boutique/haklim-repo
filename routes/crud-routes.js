const express = require('express');
const router = express.Router();

const  { postProduct, editProduct, deleteProduct, fetchProductsAdmin }  = require('../controllers/products-controller');
const { fetchOrders } = require('../controllers/orders-controller');
const crudOperations = require('../controllers/admin-controller');
// Endpoint to get products
router.post('/add-product', postProduct);
router.get('/edit-product', editProduct);
router.delete('/delete-product/:productId', deleteProduct);
router.post('/delete-product', crudOperations.deleteProduct);
router.post('/update-order-status', crudOperations.updateOrderStatus);
router.post('/update-product-status', crudOperations.updateProductStatus);

// Get all products
router.get('/fetch-products', fetchProductsAdmin);
// Get all orders
router.get('/fetch-orders', fetchOrders);

// Create a new product


module.exports = router;
