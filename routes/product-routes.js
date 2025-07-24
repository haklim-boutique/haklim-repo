const express = require('express');
const router = express.Router();

const  { fetchProducts }  = require('../controllers/products-controller');
const { 
    fetchData, 
    updateOrderStatus, 
    cancelOrder, 
    updateProductStatus, 
    addProduct, 
    deleteProduct, 
    updateProduct
 } = require('../controllers/admin-controller');
// Endpoint to get products
router.get('/get-products', fetchProducts);
router.get('/get-admin-data', fetchData);


router.post('/cancel-order', cancelOrder);
router.post('/add-product', addProduct);
router.post('/delete-product', deleteProduct);
router.put('/update-product', updateProduct);


module.exports = router;
