const formidable = require('formidable');
const cloudinary = require('cloudinary').v2;
const db = require('../models/db');
//const fs = require('fs');


// Sample products data
const products = [
    {
        id: "1",
        name: "Fashion Open Shoe",
        category: "Footwear",
        subcategory: "Women's Shoes",
        brand: "Haklim",
        price: 450,
        discount: 55,
        discounted_price: 395,
        stock: 15,
        features: [
            "Premium leather upper",
            "Comfortable cushioned insole",
            "Breathable lining",
            "Flexible rubber outsole",
            "Available in multiple colors"
        ],
        description: "Elegant open-toe shoes perfect for both casual and formal occasions. Handcrafted with premium materials for maximum comfort and style.",
        images: ["/images/haklim-smpl1.jpg"],
        video: null,
        status: "active",
        badge: "New"
    },
    {
        id: "2",
        name: "Florentine Silk Scarf",
        category: "Accessories",
        subcategory: "Scarves",
        brand: "Haklim",
        price: 185,
        discount: 0,
        discounted_price: 185,
        stock: 8,
        features: [
            "100% pure silk",
            "Hand-rolled edges",
            "Oeko-Tex certified dyes",
            "Lightweight and breathable",
            "Versatile styling options"
        ],
        description: "Luxurious silk scarf with intricate Florentine patterns. A timeless accessory that adds elegance to any outfit.",
        images: ["https://images.unsplash.com/photo-1542272604-787c3835535d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1026&q=80"],
        video: null,
        status: "active",
        badge: "Bestseller"
    },
    {
        id: "3",
        name: "Venezia Leather Wallet",
        category: "Accessories",
        subcategory: "Wallets",
        brand: "Haklim",
        price: 275,
        discount: 0,
        discounted_price: 275,
        stock: 12,
        features: [
            "Genuine Italian leather",
            "Multiple card slots",
            "RFID blocking technology",
            "Slim profile design",
            "Hand-stitched construction"
        ],
        description: "Sophisticated leather wallet inspired by Venetian craftsmanship. Compact yet spacious enough for all your essentials.",
        images: ["https://images.unsplash.com/photo-1592878904946-b3cd8ae243d0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=735&q=80"],
        video: null,
        status: "active",
        badge: null
    },
    {
        id: "4",
        name: "Cashmere Crewneck",
        category: "Apparel",
        subcategory: "Sweaters",
        brand: "Haklim",
        price: 320,
        discount: 0,
        discounted_price: 320,
        stock: 5,
        features: [
            "100% Mongolian cashmere",
            "Ribbed cuffs and hem",
            "Classic crewneck design",
            "Machine washable",
            "Available in neutral tones"
        ],
        description: "Ultra-soft cashmere sweater that provides warmth without bulk. A wardrobe essential for effortless elegance.",
        images: ["https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=735&q=80"],
        video: null,
        status: "active",
        badge: "Limited"
    },
    {
        id: "5",
        name: "Silk Evening Gown",
        category: "Apparel",
        subcategory: "Dresses",
        brand: "Haklim",
        price: 650,
        discount: 100,
        discounted_price: 550,
        stock: 3,
        features: [
            "100% pure silk charmeuse",
            "Hidden back zipper",
            "Bias-cut silhouette",
            "Hand-finished seams",
            "Dry clean only"
        ],
        description: "Stunning silk evening gown that drapes beautifully. Perfect for special occasions where you want to make an unforgettable impression.",
        images: ["https://images.unsplash.com/photo-1539109136881-3be0616acf4b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=687&q=80"],
        video: null,
        status: "active",
        badge: "New"
    },
    {
        id: "6",
        name: "Leather Crossbody Bag",
        category: "Accessories",
        subcategory: "Bags",
        brand: "Haklim",
        price: 280,
        discount: 0,
        discounted_price: 280,
        stock: 7,
        features: [
            "Full-grain leather",
            "Adjustable strap",
            "Multiple compartments",
            "Gold-tone hardware",
            "Protective feet on base"
        ],
        description: "Chic and practical crossbody bag that transitions seamlessly from day to night. Fits all your essentials without bulk.",
        images: ["https://images.unsplash.com/photo-1594035910387-fea47794261f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=880&q=80"],
        video: null,
        status: "active",
        badge: null
    },
    {
        id: "7",
        name: "Wool Cashmere Coat",
        category: "Apparel",
        subcategory: "Outerwear",
        brand: "Haklim",
        price: 500,
        discount: 80,
        discounted_price: 420,
        stock: 4,
        features: [
            "80% wool, 20% cashmere blend",
            "Notched lapel",
            "Fully lined",
            "Functional button closure",
            "Side slit pockets"
        ],
        description: "Luxurious wool-cashmere blend coat that provides warmth without weight. A timeless piece that will last for seasons to come.",
        images: ["https://images.unsplash.com/photo-1551232864-3f0890e580d9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1287&q=80"],
        video: null,
        status: "active",
        badge: "Sale"
    },
    {
        id: "8",
        name: "Linen Summer Dress",
        category: "Apparel",
        subcategory: "Dresses",
        brand: "Haklim",
        price: 195,
        discount: 0,
        discounted_price: 195,
        stock: 10,
        features: [
            "100% organic linen",
            "A-line silhouette",
            "Concealed side zipper",
            "Machine washable",
            "Naturally breathable fabric"
        ],
        description: "Effortlessly chic linen dress perfect for warm weather. The relaxed fit and natural fabric make it incredibly comfortable.",
        images: ["https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=734&q=80"],
        video: null,
        status: "active",
        badge: null
    },
    {
        id: "9",
        name: "Velvet Blazer",
        category: "Apparel",
        subcategory: "Jackets",
        brand: "Haklim",
        price: 380,
        discount: 0,
        discounted_price: 380,
        stock: 6,
        features: [
            "Luxury cotton velvet",
            "Peak lapel",
            "Functional button closure",
            "Internal pocket",
            "Dry clean only"
        ],
        description: "Opulent velvet blazer that adds instant sophistication. Perfect for elevating both formal and casual ensembles.",
        images: ["https://images.unsplash.com/photo-1595341888016-a392ef81b7de?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1179&q=80"],
        video: null,
        status: "active",
        badge: null
    },
    {
        id: "10",
        name: "Silk Pajama Set",
        category: "Apparel",
        subcategory: "Sleepwear",
        brand: "Haklim",
        price: 220,
        discount: 0,
        discounted_price: 220,
        stock: 9,
        features: [
            "100% mulberry silk",
            "Drawstring waist",
            "Chinese collar",
            "Hand-rolled seams",
            "Machine washable"
        ],
        description: "Indulgent silk pajama set that makes bedtime luxurious. The perfect gift for someone special (or yourself).",
        images: ["https://images.unsplash.com/photo-1596755094514-f87e34085b2c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=688&q=80"],
        video: null,
        status: "active",
        badge: null
    }
];


const fetchProducts = async (req, res) => {
     const productLoadQuery = 'SELECT * FROM products'; 
try{
const productsData = await db.query(productLoadQuery); 
const storeID = productsData;
console.log(storeID) 
} catch(err){
    console.error(err);
}
    res.json(products);
};

module.exports = { fetchProducts }
