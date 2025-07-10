const formidable = require('formidable');
const cloudinary = require('cloudinary').v2;
const db = require('../models/db');
const fs = require('fs');

// Cloudinary Configuration
cloudinary.config({
      cloud_name: 'dxpahbia0',
    api_key: '255881524771173',
    api_secret: 'FN2lTsIZDsOrLrWAAybcoKNUpn8'
});




const fetchProducts = async (req, res) => {
     const productLoadQuery = 'SELECT * FROM products'; 
try{
const productsData = await db.query(productLoadQuery); 
const products = productsData.rows;

 res.json(products);
 
} catch(err){
    console.error(err);
    res.status(500).json({mesage: 'There was an error fetching data'})
}
};

const fetchProductsAdmin = async (req, res) => {
     const productLoadQuery = 'SELECT * FROM products'; 
try{
const productsData = await db.query(productLoadQuery); 
const products = productsData.rows;

 res.json(products);
 
} catch(err){
    console.error(err);
    res.status(500).json({mesage: 'There was an error fetching data'})
}
};

const postProduct = async (req, res) => {
    
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
                            id, name, category, subcategory, class,
                            brand, badge, variations, price, discount, discounted_price,
                            stock, features, description, images, video,
                            status, link_endpoint, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12,
                            $13, $14, $15, $16::jsonb, $17, $18, NOW(), NOW()
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
                        features,
                        description,
                        imageUrls,
                        videoUrl,
                        'active',
                        linkEndpoint
                    ]);

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

const editProduct  = async (req, res) => {
    res.json({});
}

const deleteProduct = async (req, res) => {
    const { productId } = req.params;
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
                    error: cloudinaryError.message
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






module.exports = { fetchProducts, fetchProductsAdmin, postProduct, editProduct, deleteProduct }
