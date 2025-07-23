const express = require('express');
const formidable = require('formidable');
const cloudinary = require('cloudinary').v2;
const db = require('../models/db');
const fs = require('fs');

// Cloudinary Configuration
cloudinary.config({
      cloud_name: 'dzzh65wj4',
    api_key: '742223432451314',
    api_secret: '4qA31Ixs7Y09b7QjUhrkjrl2Xp8'
});

// Routes
const fetchData = async (req, res) => {
    try {
        const merchantId = '9E52SBO';

        const [productsRes, ordersRes] = await Promise.all([
            db.query('SELECT * FROM products'),
            db.query('SELECT * FROM orders')
        ]);

         console.log(productsRes.rows)
          console.log(ordersRes.rows)
        
    
        res.json({
            products: productsRes.rows,
            orders: ordersRes.rows
        });
    } catch (error) {
        console.error('Error fetching merchant data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/*
const updateMerchantOrderStatus = async (req, res) => {
    const { orderId, newStatus, notes } = req.body;
    console.log(req.body)
    
    // Find and update the order
    const orderIndex = ordersData.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
        ordersData[orderIndex].status = newStatus;
        res.json({ success: true, order: ordersData[orderIndex] });
    } else {
        res.status(404).json({ success: false, message: 'Order not found' });
    }
};*/

const updateOrderStatus = async (req, res) => {
  const { orderId, newStatus, notes } = req.body;
  console.log('Request body:', req.body);
  //reserve notes for email

  try {
    // Update the order status in the database
    const updateQuery = `
      UPDATE orders
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;
    const values = [newStatus, orderId];

    const { rows } = await db.query(updateQuery, values);

    console.log(rows[0]);
    //Now send the confirmation email to customer

     const mailOptions = {
        from: '"ShopJani" <no-reply@shopjani.com>',
        to: 'email',
        subject: 'Your Order is successfully Confirmed - Thank You!',
        replyTo: 'merchant-email',
        html: `<!DOCTYPE html>
              <html lang="en"><head>
              </html>`
      };


    if (rows.length > 0) {
      res.json({ success: true, order: rows[0] });
    } else {
      res.status(404).json({ success: false, message: 'Order not found' });
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const cancelOrder = async (req, res) => {
    const { orderId } = req.body;
    
    // Find and cancel the order
    const orderIndex = ordersData.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
        ordersData[orderIndex].status = 'cancelled';
        res.json({ success: true, order: ordersData[orderIndex] });
    } else {
        res.status(404).json({ success: false, message: 'Order not found' });
    }
};

const updateProductStatus = async (req, res) => {
    const { productId, newStatus } = req.body;
    
    /*/ Find and update the product
    const productIndex = productsData.findIndex(p => p.id === productId);
    if (productIndex !== -1) {
        productsData[productIndex].status = newStatus;
        res.json({ success: true, product: productsData[productIndex] });
    } else {
        res.status(404).json({ success: false, message: 'Product not found' });
    }*/
   try {
    // Update the order status in the database
    const updateQuery = `
      UPDATE products
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;
    const values = [newStatus, productId];

    const { rows } = await db.query(updateQuery, values);

    
    if (rows.length > 0) {
      res.json({ success: true, order: rows[0] });
    } else {
      res.status(404).json({ success: false, message: 'Order not found' });
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


const deleteProduct = async (req, res) => {
    const { productId } = req.body;
    console.log(`Deletion started for product: ${productId}`);
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // 1. Fetch product data
        const productQuery = 'SELECT * FROM products WHERE id = $1 FOR UPDATE';
        const productResult = await client.query(productQuery, [productId]);
        
        if (productResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                message: 'Product not found'
            });
        }

        const product = productResult.rows[0];
        console.log('Product found:', product);

        // 2. Prepare all media URLs (images + video)
        const mediaUrls = [...(product.images || [])];
        if (product.video) mediaUrls.push(product.video);
        console.log('Media URLs to delete:', mediaUrls);

        // 3. Delete from Cloudinary
        if (mediaUrls.length > 0) {
            try {
                for (const url of mediaUrls) {
                    const publicId = extractPublicIdFromUrl(url);
                    if (!publicId) {
                        console.log('Skipping URL - no public ID found:', url);
                        continue;
                    }

                    const resourceType = getResourceType(url);
                    console.log(`Deleting ${resourceType} with public ID: ${publicId}`);

                    await cloudinary.uploader.destroy(publicId, {
                        resource_type: resourceType,
                        invalidate: true
                    });
                    console.log(`Successfully deleted media: ${publicId}`);
                }
            } catch (cloudinaryError) {
                console.error('Cloudinary deletion failed:', cloudinaryError);
                await client.query('ROLLBACK');
                return res.status(500).json({
                    success: false,
                    message: 'Failed to delete product media',
                    error: 'We are having some issues deleting the media. please retry later'
                });
            }
        }

        // 4. Delete from database
        const deleteQuery = `DELETE FROM products WHERE id = $1`;
        const deleteResult = await client.query(deleteQuery, [productId]);
        console.log('Database deletion result:', deleteResult.rowCount);

        await client.query('COMMIT');  // THIS IS CRUCIAL

        // Verify deletion
        const verifyQuery = 'SELECT * FROM products WHERE id = $1';
        const verifyResult = await client.query(verifyQuery, [productId]);
        console.log('Verification after deletion:', verifyResult.rows);

        return res.status(200).json({
            success: true,
            message: 'Product and all associated media deleted successfully',
            productId
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Complete deletion error:', error);
        return res.status(500).json({
            success: false,
            message: 'Product deletion failed completely',
            error: error.message
        });
    } finally {
        client.release();
    }
};


const addProduct = async (req, res) => {
    const vendorId = 'test';
    const vendorName = 'test';
    try {
        const form = new formidable.IncomingForm({
            multiples: true,
            keepExtensions: true,
            maxFileSize: 200 * 1024 * 1024, // 200MB max
            maxFieldsSize: 20 * 1024 * 1024
        });

        form.parse(req, async (err, fields, files) => {
            if (err) {
                console.error('Form parsing error:', err);
                return res.status(400).json({ 
                    success: false,
                    message: 'Error processing form data'
                });
            }

            try {
                // Extract and validate fields
                const extractField = (field) => field ? (Array.isArray(field) ? field[0] : field) : null;
                const category = extractField(fields.category);
                const subcategory = extractField(fields.subcategory);
                const productClass = extractField(fields.productClass);
                const brand = extractField(fields.brand);
                const name = extractField(fields.name);
                const price = parseFloat(extractField(fields.price));
                const discount = parseInt(extractField(fields.discount));
                const stock = extractField(fields.stock);
                const status = extractField(fields.status);
                const badge = extractField(fields.badge);
                const description = extractField(fields.description);
                const variants = extractField(fields.variants);
                
                console.log('variants: '+ variants)
              
                //console.log(RE);
                // Handle features with proper JSON validation
                let features = [];
                try {
                    const featuresInput = extractField(fields.features);
                    if (featuresInput) {
                        features = typeof featuresInput === 'string' 
                            ? JSON.parse(featuresInput) 
                            : featuresInput;
                    }
                } catch (e) {
                    console.warn('Invalid features format:', e);
                    features = [];
                }

                // Process images
                const imageFiles = Array.isArray(files.productImages) 
                    ? files.productImages 
                    : [files.productImages];
                
                const imageUploads = imageFiles.map(file => 
                    uploadToCloudinary(file, 'image')
                );
                const imageResults = await Promise.all(imageUploads);
                const imageUrls = imageResults.map(img => img.secure_url);

                // Process video separately
                let videoUrl = null;
                if (files.productVideo && files.productVideo.filepath) {
                    try {
                        videoUrl = await uploadVideo(files.productVideo);
                    } catch (videoError) {
                        console.error('Video upload failed:', videoError);
                    }
                }

                // Insert into database
                const productId = await generateUniqueProductId();
                const linkEndpoint = await generateLinkEndpoint();
                const client = await db.connect();
                
                try {
                    await client.query('BEGIN');
                    
                    const result = await client.query(`
                        INSERT INTO products (
                            id, name, vendor_id, vendor_name, category, subcategory, class,
                            brand, badge, variations, price, discount, discounted_price,
                            stock, features, description, images, video,
                            status, link_endpoint, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                            $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW()
                        ) RETURNING *
                    `, [
                        productId,
                        name,
                        vendorId,
                        vendorName,
                        category,
                        subcategory,
                        productClass,
                        brand,
                        badge,
                        variants,
                        price,
                        discount,
                        price - discount,
                        stock,
                        JSON.stringify(features),
                        description,
                        imageUrls,
                        videoUrl,
                        'active',
                        linkEndpoint
                    ]);

                    console.log(result.rows[0])

                    await client.query('COMMIT');
                    console.log('data saved')
                    return res.status(201).json({
                        success: true,
                        product: result.rows[0]
                    });
                    
                } catch (dbError) {
                    await client.query('ROLLBACK');
                    console.error('Database error:', dbError);
                    throw dbError;
                } finally {
                    client.release();
                }
            } catch (error) {
                console.error('Processing error:', error);
                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
        });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};


/*
const updateMerchantProduct = async (req, res) => {
    const productData = req.body;
    console.log('updating merchant product...')
    // Find and update the product
    const productIndex = productsData.findIndex(p => p.id === productData.id);
    if (productIndex !== -1) {
        productsData[productIndex] = {
            ...productsData[productIndex],
            ...productData,
            variations: productData.hasVariants ? productData.variants : []
        };
        res.json({ success: true, product: productsData[productIndex] });
    } else {
        res.status(404).json({ success: false, message: 'Product not found' });
    }
};*/
const updateProduct = async (req, res) => {
       console.log('req to edit product....');
       console.log(req.body);
       console.log(req);
        const form = new formidable.IncomingForm({
            multiples: true,
            keepExtensions: true,
            maxFileSize: 200 * 1024 * 1024, // 200MB max
            maxFieldsSize: 20 * 1024 * 1024
        });
        console.log(form);
    try {
        const form = new formidable.IncomingForm({
            multiples: true,
            keepExtensions: true,
            maxFileSize: 200 * 1024 * 1024, // 200MB max
            maxFieldsSize: 20 * 1024 * 1024
        });

        form.parse(req, async (err, fields, files) => {
            if (err) {
                console.error('Form parsing error:', err);
                return res.status(400).json({ 
                    success: false,
                    message: 'Error processing form data'
                });
            }
        console.log('req to edit product....2')
            try {
                // Extract and validate fields
                const extractField = (field) => field ? (Array.isArray(field) ? field[0] : field) : null;
                const category = extractField(fields.category);
                const subcategory = extractField(fields.subcategory);
                const productClass = extractField(fields.productClass);
                const brand = extractField(fields.brand);
                const name = extractField(fields.name);
                const price = parseFloat(extractField(fields.price));
                const discount = parseInt(extractField(fields.discount));
                const stock = extractField(fields.stock);
                const status = extractField(fields.status);
                const badge = extractField(fields.badge);
                const description = extractField(fields.description);
                const variants = extractField(fields.variants);
                
                console.log('variants: '+ variants)
              
                //console.log(RE);
                // Handle features with proper JSON validation
                let features = [];
                try {
                    const featuresInput = extractField(fields.features);
                    if (featuresInput) {
                        features = typeof featuresInput === 'string' 
                            ? JSON.parse(featuresInput) 
                            : featuresInput;
                    }
                } catch (e) {
                    console.warn('Invalid features format:', e);
                    features = [];
                }

                

                
                // Process images
                const imageFiles = Array.isArray(files.productImages) 
                    ? files.productImages 
                    : [files.productImages];
                
                const imageUploads = imageFiles.map(file => 
                    console.log('req to edit product....FILE')
                    //uploadToCloudinary(file, 'image')
                );
                const imageResults = await Promise.all(imageUploads);
                const imageUrls = imageResults.map(img => img.secure_url);

                // Process video separately
                let videoUrl = null;
                if (files.productVideo && files.productVideo.filepath) {
                    try {
                        videoUrl = await uploadVideo(files.productVideo);
                    } catch (videoError) {
                        console.error('Video upload failed:', videoError);
                    }
                }

                // Insert into database
                const productId = await generateUniqueProductId();
                const linkEndpoint = await generateLinkEndpoint();
                const client = await db.connect();
                
                try {
                    await client.query('BEGIN');
                    
                    const result = await client.query(`
                        INSERT INTO productsS (
                            id, name, category, subcategory, class,
                            brand, badge, variations, price, discount, discounted_price,
                            stock, features, description, images, video,
                            status, link_endpoint, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                            $13, $14, $15, $16, $17, $18, NOW(), NOW()
                        ) RETURNING *
                    `, [
                        productId,
                        name,
                        category,
                        subcategory,
                        productClass,
                        brand,
                        badge,
                        variants,
                        price,
                        discount,
                        price - discount,
                        stock,
                        JSON.stringify(features),
                        description,
                        imageUrls,
                        videoUrl,
                        'active',
                        linkEndpoint
                    ]);

                    console.log(result.rows[0])

                    await client.query('COMMIT');
                    console.log('data saved')
                    return res.status(201).json({
                        success: true,
                        product: result.rows[0]
                    });
                    
                } catch (dbError) {
                    await client.query('ROLLBACK');
                    console.error('Database error:', dbError);
                    throw dbError;
                } finally {
                    client.release();
                }
            } catch (error) {
                console.error('Processing error:', error);
                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
        });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};




//////////////////////////////////////////////////////////////////////////////



// Helper Functions
async function deleteCloudinaryMedia(urls) {
    const publicIds = urls.map(url => url.match(/upload\/(?:v\d+\/)?([^\/]+)/)?.[1]).filter(Boolean);
    if (publicIds.length > 0) {
        await cloudinary.api.delete_resources(publicIds, { 
            resource_type: 'auto',
            type: 'upload'
        });
    }
}

async function uploadNewMedia(files) {
    const result = { images: [], video: null };
    
    // Upload Images
    if (files.newImages) {
        const imageFiles = Array.isArray(files.newImages) ? files.newImages : [files.newImages];
        result.images = await Promise.all(
            imageFiles.map(file => uploadToCloudinary(file, 'image', 'products/images'))
        );
    }

    // Upload Video
    if (files.newVideo) {
        result.video = await uploadToCloudinary(files.newVideo, 'video', 'products/videos');
    }

    return result;
}

async function updateProductInDB(client, productId, fields, newMedia, deletedLinks) {
    const query = `
        UPDATE products SET
            name = $1, category = $2, subcategory = $3,
            brand = $4, other_brand = $5, price = $6,
            discount = $7, discounted_price = $8, stock = $9,
            features = $10::jsonb, description = $11,
            ${getMediaUpdateClause(newMedia, deletedLinks)}
        WHERE id = $${getParamCount(newMedia, deletedLinks)}
        RETURNING *
    `;

    const params = [
        fields.name, fields.category, fields.subcategory,
        fields.brand, fields.otherBrand || null, parseFloat(fields.price),
        parseInt(fields.discount) || 0, calculateDiscountPrice(fields),
        parseInt(fields.stock) || 0, fields.features, fields.description,
        ...getMediaParams(newMedia, deletedLinks),
        productId
    ];

    const result = await client.query(query, params);
    return result.rows[0];
}

function getMediaUpdateClause(newMedia, deletedLinks) {
    let clause = '';
    if (newMedia.images.length > 0) clause += 'images = array_cat(images, $12), ';
    if (deletedLinks.length > 0) clause += 'images = array_remove(images, ANY($13)), ';
    if (newMedia.video) clause += 'video = $14, ';
    else if (deletedLinks.some(l => l.includes('/video/'))) clause += 'video = NULL, ';
    return clause;
}

// Helper to extract public ID from URL (works for both images and videos)
function extractPublicIdFromUrl(url) {
    // Example: https://res.cloudinary.com/demo/image/upload/v123/sample.jpg → "sample"
    const matches = url.match(/\/([^\/]+?)(?:\.[^\.\/]+)?$/);
    return matches ? matches[1] : null;
}

// Helper to determine resource type from URL
function getResourceType(url) {
    return url.includes('/video/upload/') ? 'video' : 'image';
}




// Enhanced upload function with more debugging
async function uploadToCloudinary(file, resourceType, folder) {
    return new Promise((resolve, reject) => {
        if (!file || !file.filepath) {
            return reject(new Error('Invalid file object'));
        }

        console.log(`Uploading to Cloudinary: ${file.originalFilename || 'unknown'} to ${folder}`);
        
        const options = {
            resource_type: resourceType,
            folder: folder,
            quality: 'auto',
            fetch_format: 'auto',
            timeout: 60000 // 60 seconds timeout
        };

        if (resourceType === 'video') {
            options.resource_type = 'video';
            options.quality = 70;
            options.chunk_size = 6000000; // 6MB chunks for video
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            options,
            (error, result) => {
                // Clean up temp file regardless of success/failure
                fs.unlink(file.filepath, (unlinkError) => {
                    if (unlinkError) console.error('Error deleting temp file:', unlinkError);
                });

                if (error) {
                    console.error('Cloudinary upload error:', error);
                    reject(error);
                } else {
                    console.log('Upload successful:', result.secure_url);
                    resolve(result);
                }
            }
        );

        // Add error handling for the file stream
        const fileStream = fs.createReadStream(file.filepath);
        fileStream.on('error', (err) => {
            console.error('File stream error:', err);
            reject(err);
        });

        fileStream.pipe(uploadStream);
    });
}


// Specialized video upload function
async function uploadVideo(file) {
    return new Promise((resolve, reject) => {
        const upload = cloudinary.uploader.upload_large(file.filepath, {
            resource_type: 'video',
            chunk_size: 6000000,
            timeout: 120000,
            folder: 'ecommerce/videos'
        }, (error, result) => {
            fs.unlink(file.filepath, () => {});
            if (error) reject(error);
            else resolve(result);
        });
    });
}

// ID generation with retry limit
async function generateUniqueProductId() {
    const idCheckQuery = 'SELECT 1 FROM products WHERE id = $1 LIMIT 1';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
        let result = '';
        for (let i = 0; i < 11; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        try {
            const { rowCount } = await db.query(idCheckQuery, [result]);
            if (rowCount === 0) return result;
        } catch (error) {
            console.error('ID generation query error:', error);
        }
    
}

//Unique link endpoint generationb
async function generateLinkEndpoint() {
    const idCheckQuery = 'SELECT 1 FROM products WHERE link_endpoint = $1 LIMIT 1';
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
        let result = '';
        for (let i = 0; i < 7; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        try {
            const { rowCount } = await db.query(idCheckQuery, [result]);
            
            if (rowCount === 0) {
                return result;} else{ generateLinkEndpoint() }
        } catch (error) {
            console.error('ID generation query error:', error);
        }
    
}

// Vendor update with retry logic
async function updateVendorProductCount(vendorId, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await db.query(
                'UPDATE vendors SET product_count = product_count + 1 WHERE id = $1',
                [vendorId]
            );
            return;
        } catch (error) {
            console.error(`Vendor update attempt ${attempt} failed:`, error);
            if (attempt === retries) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}





module.exports = { 
    fetchData, 
    updateOrderStatus, 
    cancelOrder, 
    updateProductStatus, 
    addProduct, 
    deleteProduct, 
    updateProduct
 }

 /*
 // Sample data
const merchantData = {
    id: "9E52SBO",
    firstname: "Livingstone",
    lastname: "Victor",
    email: "barakaemmanuel477@gmail.com",
    telephone: "+254718135217",
    store_name: "Baraka ENT",
    link_endpoint: "mainstore",
    website: "examplesite.com",
    social_handles: `{"tiktok": "https://www.tiktok.com/@johndoe", "twitter": "https://twitter.com/johndoe", "facebook": "https://facebook.com/johndoe", "linkedin": "https://linkedin.com/in/johndoe", "instagram": "https://instagram.com/john.doe"}`,
    joined_on: "1 Jul 2025",
    settings: "",
    subscription_plan: `{"from": "2025-05-13", "plan": "starter", "expiry": "2025-09-13", "payment": 4999}`,
    transaction_history: `[{"amount": 1500, "timestamp": {"day": 25, "time": "10:00:00", "year": 2025, "month": 6}, "description": "purchase of items", "transaction": "credit", "final_balance": 115, "initial_balance": 100}, {"amount": 1800, "timestamp": {"day": 25, "time": "11:20:00", "year": 2025, "month": 6}, "description": "purchases of iphone", "transaction": "credit", "final_balance": 133, "initial_balance": 115}, {"amount": 250, "timestamp": {"day": 26, "time": "09:15:00", "year": 2025, "month": 6}, "description": "withdrawal to mpesa", "transaction": "withdrawal", "final_balance": 108, "initial_balance": 133}]`,
    pending_transactions: `[{"amount": 15, "timestamp": {"day": 25, "time": "10:00:00", "year": 2025, "month": 6}, "description": "purchases escrow fun of iPhone", "transaction": "credit"}, {"amount": 18, "timestamp": {"day": 25, "time": "11:20:00", "year": 2025, "month": 6}, "description": "commission from product_order", "transaction": "credit"}, {"amount": 250, "timestamp": {"day": 26, "time": "09:15:00", "year": 2025, "month": 6}, "description": "pending withdrawal request", "transaction": "withdrawal"}]`,
    cash_balance: "7690",
    payment_methods: `{"default": "mpesa", "methods": [{"type": "mpesa", "account_name": "John Mwangi", "phone_number": "+254712345678"}, {"type": "airtel_money", "account_name": "Jane Otieno", "phone_number": "+254733456789"}, {"type": "bank", "branch": "Nairobi CBD", "bank_name": "KCB", "account_name": "John Mwangi", "account_number": "123456789"}]}`
};

const productsData = [
    {
        id: "A8LF1UVM79U",
        name: "iPhone 16e",
        category: "Electronics & Media",
        subcategory: "Mobile Phones & Accessories",
        brand: "Apple",
        other_brand: "",
        price: 95000.00,
        discount: 4000,
        discounted_price: 91000.00,
        stock: 11,
        features: ["Dual SIM (Nano + eSIM), 5G support", "8GB RAM + 256GB internal storage (non-expandable)", "6.1″ Super Retina XDR OLED display", "48MP rear camera with OIS, 4K Dolby Vision HDR video", "4005mAh battery with 45W wired charging, 7.5W wireless charging"],
        description: "The latest iPhone with advanced features",
        images: ["https://res.cloudinary.com/dzzh65wj4/image/upload/v1751486887/u3ecgcn6bn1ptqj0soeo.jpg"],
        video: "",
        status: "active",
        url: "",
        variations: [],
        class: "Smartphone"
    },
    {
        id: "E9Z4VEKM42X",
        name: "Galaxy S25 Ultra",
        category: "Electronics & Media",
        subcategory: "Mobile Phones & Accessories",
        brand: "Samsung",
        other_brand: "",
        price: 145000.00,
        discount: 26000,
        discounted_price: 119000.00,
        stock: 20,
        features: ["Dual SIM 5G Supported", "Titanium frame, IP68, S Pen included", "5000mAh battery, 45W fast charging, wireless charging", "Snapdragon 8 Gen 3, 12GB RAM, up to 1TB storage", "200MP + 50MP + 10MP + 50MP rear cameras, 8K video", "6.9″ AMOLED 2X, 120Hz, QHD+, 2600 nits"],
        description: "Samsung's flagship smartphone with cutting-edge technology",
        images: ["https://res.cloudinary.com/dzzh65wj4/image/upload/v1751484516/bzknzm1umao4e4wxqbff.jpg"],
        video: "",
        status: "active",
        url: "",
        variations: [],
        class: "Smartphone"
    }
];

const ordersData = [
    {
        id: "JKN-1081",
        customer_info: {
            firstname: "dfgvb",
            lastname: "asdv",
            email: "barakaemmanuel477@gmail.com",
            telephone: "aFgv",
            delivery_method: "store",
            delivery_address: {
                delivery_address: "store"
            },
            packaging_instructions: "EWTFV"
        },
        subtotal: 199000,
        delivery_fee: 150,
        total: 199150,
        payment_method: "credit",
        transaction_code: "",
        payment_completed: false,
        status: "pending",
        order_tracking_id: "b77446f1-5724-4be3-a3de-db9d0238c470",
        order_timestamp: "2025-07-03 18:31:56.007058+00",
        items: [
            { id: "8RCYGRKT111", name: "iPhone 16e", price: 95000, quantity: 2 },
            { id: "9RPNGJDM3N2", name: "Galaxy S25 Ultra", price: 145000, quantity: 1 }
        ],
        date: ""
    },
    {
        id: "JKN-9703",
        customer_info: {
            firstname: "Livingstone",
            lastname: "Victor",
            email: "barakaemmanuel477@gmail.com",
            telephone: "0718135217",
            delivery_method: "store",
            delivery_address: {
                delivery_address: "store"
            },
            promo_code: "GHDK",
            packaging_instructions: "xdfgd"
        },
        subtotal: 130,
        delivery_fee: 150,
        total: 1,
        payment_method: "MpesaKE",
        transaction_code: "TFQ6HJIN1S",
        payment_completed: true,
        status: "processing",
        order_tracking_id: "e71e3237-50d4-4359-a1e0-dba4ef645f09",
        order_timestamp: "9:48",
        items: [
            { id: "AM9WDTBZ8ZT", name: "MacBook Pro", price: 130, quantity: 1 }
        ],
        date: { day: "26", month: "06", year: 2025 }
    }
];*/