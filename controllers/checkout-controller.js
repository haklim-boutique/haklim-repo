const express = require('express');
const axios = require('axios');
const db = require('../models/db'); // Import your database connection
const nodemailer = require('nodemailer');


const app = express();

// Middleware to parse JSON bodies
app.use(express.json());
// For form-urlencoded:
app.use(express.urlencoded({ extended: true }));



// Configure Nodemailer with Zoho SMTP settings
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',  // Zoho SMTP server
  port: 465,              // SSL port
  secure: true,           // Use SSL/TLS
  auth: {
    user: 'no-reply@shopjani.com', 
    pass: 'yqY7xb#007', 
  },
});

// Pesapal API Credentials 
const consumerKey = 'O/GHBWesF9THzHXUG3odVl2E2u6wN5vJ'; 
const consumerSecret = 'gipCj9xZJAkGWv77Te/PvHzHJhg=';

// Pesapal API URLs
const pesapalAuthUrl = 'https://pay.pesapal.com/v3/api/Auth/RequestToken';
const pesapalSubmitOrderUrl = 'https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest';
const pesapalTransactionStatusUrl = 'https://pay.pesapal.com/v3/api/Transactions/GetTransactionStatus';



// Function to retrieve Pesapal access token
const getPesapalAccessToken = async () => {
  try {
    const response = await axios.post(
      pesapalAuthUrl,
      { consumer_key: consumerKey, consumer_secret: consumerSecret },
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log('Access Token Response:', response.data);
    return response.data.token; // Returns access token
  } catch (error) {
    console.error('Error fetching access token:', error.response?.data || error.message);
    throw new Error('Failed to retrieve access token');
  }
};

function getCurrentTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// Payment Endpoint (Initiates the Payment Request)
const createOrder = async (req, res) => {
  console.log('checkout process initiated...')
  console.log('Body:', req.body); // ✅ this is what you're after
  const { cart, customerInfo, paymentMethod } = req.body;
  const io = req.app.get('io');
  //console.log(re)
  try {
    // Validate input data
    if (!cart || !Array.isArray(cart)) {
        console.log('Invalid cart data')
      return res.status(400).json({
        success: false,
        error: 'INVALID_CART',
        message: 'Cart data is invalid or empty'
      });
    }

    // Get current product data from database
    const productIds = cart.map(item => item.id);
    const productQuery = await db.query(
      `SELECT id, name, brand, 
             price, discount 
             FROM products WHERE id = ANY($1)`, // AND products_available = true`,
      [productIds]
    );

    const dbProducts = productQuery.rows;

    // Check product availability
    if (dbProducts.length !== productIds.length) {
      const missingProducts = productIds.filter(id =>
        !dbProducts.some(p => p.products_id === id)
      );
      return res.status(400).json({
        success: false,
        error: 'PRODUCT_UNAVAILABLE',
        message: 'Some products are no longer available',
        missingProducts
      });
    }

    // Calculate order totals
    let subtotal = 0;
    let deliveryFee = 150;
    const orderItems = cart.map(cartItem => {
      const product = dbProducts.find(p => p.id === cartItem.id);
      const price = parseFloat(product.price);
      const discount = parseFloat(product.discount || 0);
      const quantity = parseInt(cartItem.quantity, 10) || 1;
      const itemTotal = (price - discount) * quantity;

      subtotal += itemTotal;

      return {
        id: product.products_id,
        name: `${product.products_brand} ${product.products_name}`,
        price: price,
        discount: discount,
        quantity: quantity,
        image: product.products_img1,
        itemTotal: itemTotal
      };
    });

    // Generate order IDs
    const orderId = `JKN-${Date.now().toString().slice(-4)}`;
    // const orderTrackingId = `TRK-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;


    const total = subtotal + deliveryFee;
    console.log('Total Cart Cost:', subtotal);

    console.log(cart)
    // Get Pesapal access token
    const accessToken = await getPesapalAccessToken();

    // Prepare payment data (adjusted based on your example)
    const paymentData = {
      id: orderId,
      currency: 'KES',
      amount: 1, //total,
      description: `Payment for order ${orderId}`,
      callback_url: 'https://e8899e21f1f2.ngrok-free.app/checkout/handle-ipn-callback',
      notification_id: '89163cfe-cf2e-40c6-8a93-db8994d24f10',
      billing_address: {
        email_address: customerInfo.email,
        phone_number: customerInfo.phone,
        country_code: 'KE',
        first_name: customerInfo.fullName, //.split(' ')[0],
        last_name: customerInfo.fullName, //.split(' ').slice(1).join(' ') || 'Customer',
        line_1: customerInfo.shippingAddress,
        city: customerInfo.city,
        postal_code: customerInfo.zipCode
      }
    };



    // Submit payment request to Pesapal
    const pesapalResponse = await axios.post(
      pesapalSubmitOrderUrl,
      paymentData,
      {
        withCredentials: true, // This ensures cookies (including session) are sent with the request 
        headers: {
          Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json'
        }
      }
    );

    console.log('Pesapal Payment Response:', pesapalResponse.data);
    const orderTrackingId = pesapalResponse.data.order_tracking_id;


    if (pesapalResponse.status !== 200) {
      throw new Error('Failed to initiate payment with Pesapal');
    }

    // Save preliminary order data to database
    try {
      await db.query(
        `INSERT INTO orders (
                id, customer_info, total, subtotal, delivery_fee,
                payment_method, status, items, order_tracking_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orderId,
          customerInfo,
          total,
          subtotal,
          deliveryFee,
          paymentMethod,
          'pending',
          JSON.stringify(cart),
          orderTrackingId
        ]
      );

      console.log('first order data inserted successfully..')

    } catch (error) {
      console.error('Error inserting first batch orderdata to database', error)

      // Return error response
      return res.status(500).json({
        success: false,
        message: `We're currently having an issue processing your order. Please try again after 5 minutes`
      });
    }

    // Return success response with redirect URL
    res.json({
      success: true,
      redirectUrl: pesapalResponse.data.redirect_url,
      orderId: orderId,
      trackingId: orderTrackingId,
      message: 'Please complete your payment to finalize the order'
    });

  } catch (error) {
    console.error('Error processing cart:', error.message || error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

// IPN Callback Endpoint (handles the IPN notification from Pesapal)
const handleIPNCallback = async (req, res) => {
  console.log('Initiating IPN Callback......')
  try {
    const notification = req.query; // Get the query parameters sent by Pesapal
    console.log('Received IPN notification:', notification);

    const { OrderTrackingId, OrderMerchantReference } = notification; // Extract tracking and merchant reference IDs

    const savedDetailsQuery = 'SELECT * FROM orders WHERE order_tracking_id = $1'
    const SAVED_ORDER_DETAILS = await db.query(savedDetailsQuery, [OrderTrackingId]);
    const savedOrderDetails = SAVED_ORDER_DETAILS.rows[0];
    const firstName = savedOrderDetails.customer_info.firstname;
    const email = savedOrderDetails.customer_info.email;
    const promoCode = savedOrderDetails.customer_info.promo_code;
    const totalWithoutShippingCost = savedOrderDetails.subtotal;


    // Step 1: Get the Pesapal access token
    const accessToken = await getPesapalAccessToken();

    // Step 2: Make a GET request to check the transaction status
    const statusResponse = await axios.get(
      `${pesapalTransactionStatusUrl}?orderTrackingId=${OrderTrackingId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

     console.log('Transaction Status Response:', statusResponse);
    console.log('Transaction Status Response:', statusResponse.data);

    // Step 3: Check if the transaction was successful
    if (statusResponse.data.status === '200') {

      const transactionDetails = statusResponse.data;
      console.log(Object.keys(statusResponse));
      console.log(Object.keys(statusResponse.data))
      const idCheckQuery = 'SELECT * FROM orders WHERE id = $1';


      function generateRandomString(length) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        const charactersLength = characters.length;

        for (let i = 0; i < length; i++) {
          result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }

        return result;
      }


      let orderUniqueID = generateRandomString(7);

      // Verify that the generated string does not exist in the database
      while (true) {
        const idCheckResult = await db.query(idCheckQuery, [orderUniqueID]);

        if (idCheckResult.rows.length === 0) {
          break;
        }
        console.log('Order Tracking ID already exists, regenerating...');
        orderUniqueID = generateRandomString(7);
      }

      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
      const year = now.getFullYear();
      const hour = now.getHours();
      const minute = now.getMinutes().toString().padStart(2, '0'); // adds leading 0 if needed

      const date = {day: day, month: month, year: year};
      const time = `${hour}:${minute}`;

      const transactionCode = transactionDetails.confirmation_code; /////////
      const amountPaid = transactionDetails.amount || 0;  /////////////
      const timestamp = time;//transactionDetails.created_date; ////////////// Current timestamp
      const OrderTrackingId = transactionDetails.order_tracking_id; ///////////////
      const paymentMethod = transactionDetails.payment_method || 'Unknown';  /////////////


      if (promoCode && promoCode.trim() !== '') {
  
        const result = await db.query(
    'SELECT * FROM marketers WHERE promo_code = $1 LIMIT 1',
    [promoCode]
  );

  if (result.rows.length > 0) {
    console.log('promocode is valid. applying promo stuff...');
    const promoCodeCheck = result.rows[0];
    console.log(promoCodeCheck); 
    const commission = Math.round(totalWithoutShippingCost * 0.2);
     const promoPoints = 15;
     const initialPointsBalance = promoCodeCheck.promo_points;
     const initialCashBalance = promoCodeCheck.cash_balance;
      const finalPointsBalance = Number(initialPointsBalance) + promoPoints;
      const finalCashBalance = Number(initialCashBalance) + commission;
      const today = new Date().getDate();
      const thisMonth = new Date().getMonth() + 1;
      const thisYear = new Date().getFullYear();

     const salesData = { 
       day: today,
       time: getCurrentTimeString(),
       year: thisYear,
       month: thisMonth,
       commission: commission,
       promo_points: promoPoints,
       purchase_type: "product_order",
       purchase_amount: 50
     };

     const transactioHistoryData =  {
     amount: commission,
     timestamp: {
       day: today,
       time: getCurrentTimeString(),
       year: thisYear,
       month: thisMonth
    },
     description: "commission from customer purchase",
     transaction: "credit",
     final_balance: finalCashBalance,
     initial_balance: initialCashBalance
  };

     const pointAdditionData = {
    points: promoPoints,
    timestamp: {
      day: today,
      time: getCurrentTimeString(),
      year: thisYear,
      month: thisMonth
    },
     description: "customer purchase bonus",
     transaction: "addition",
     final_balance: finalPointsBalance,
     initial_balance: initialPointsBalance
  };

  const query = `
  UPDATE marketers
  SET 
    purchases = COALESCE(purchases, '[]'::jsonb) || to_jsonb($1::json),
    points_redemption_history = COALESCE(points_redemption_history, '[]'::jsonb) || to_jsonb($2::json),
    transaction_history = COALESCE(transaction_history, '[]'::jsonb) || to_jsonb($3::json),
    promo_points = $4,
    cash_balance = $5
  WHERE promo_code = $6;
`;
try{
await db.query(query, [salesData, pointAdditionData, transactioHistoryData, finalPointsBalance, finalCashBalance, promoCode]);
} catch(err){
  console.error(err);
}


  }

}


      // Query to update the transaction data in the database........
      try {
        await db.query(
          `UPDATE orders SET transaction_code = $1, total = $2, order_timestamp = $3, date =$4, payment_method = $5, payment_completed = true WHERE order_tracking_id = $6`,
          [transactionCode, amountPaid, timestamp, date, paymentMethod, OrderTrackingId]
        );
      } catch (error) {
        console.error("Error updating order:", error);
      }


      //Send Notification email....
      const trackingUrl = `https://shopjani.com/track/${OrderTrackingId}`;
      const supportEmail = 'customer-support@shopjani.com';
      const mailOptions = {
        from: '"ShopJani" <no-reply@shopjani.com>',
        to: email,
        subject: 'Your Order is successfully Confirmed - Thank You!',
        html: `<!DOCTYPE html>
              <html lang="en"><head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Order Confirmation</title>
                <style>
                  /* General Styles */
                *{
                    box-sizing: border-box;
                }
                  body {
                    font-family: 'Montserrat', sans-serif;
                    margin: 0;
                    padding: 12px;
                    background-color: #f7f7f7;
                    color: #333;
                    line-height: 1.6;
                  }

                  .email-container {
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                  }

                  .header {
                    background-color: #28282b;
                    color: #ffffff;
                    text-align: center;
                    padding: 20px;
                  }

                  .header h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 700;
                  }

                  .content {
                    padding: 20px;
                    text-align: center;
                  }

                  .content h2 {
                    font-size: 20px;
                    color: #28282b;
                    margin-bottom: 15px;
                  }

                  .content p {
                    margin: 0 0 20px;
                    font-size: 16px;
                    color: #555;
                    text-align: left;
                  }

                  .tracking-button {
                    display: inline-block;
                    background-color: #28282b;
                    color: white;
                    text-decoration: none;
                    padding: 12px 25px;
                    border-radius: 5px;
                    font-size: 16px;
                    font-weight: 500;
                    margin: 20px 0;
                    transition: background-color 0.3s ease;
                  }

                  .tracking-button:hover {
                    background-color: #000000;
                  }

                  .footer {
                    background-color: #f1f1f1;
                    padding: 20px;
                    font-size: 14px;
                    color: #777;
                    text-align: center;
                  }

                  .footer a {
                    color: #007bff; /* Default blue for links */
                    text-decoration: none;
                  }

                  .footer a:hover {
                    text-decoration: underline;
                  }

                  .social-icons {
                    margin: 15px 0;
                  }

                  .social-icons a {
                    display: inline-block;
                    margin: 0 5px;
                    text-decoration: none;
                  }

                  .social-icons img {
                    width: 24px;
                    height: 24px;
                    vertical-align: middle;
                    filter: brightness(0); /* Black icons */
                  }
                </style>
              </head>
              <body>
                <div class="email-container">
                  <!-- Header -->
                  <div class="header">
                    <h1><strong>ShopJani</strong></h1>
                  </div>

                  <!-- Content -->
                  <div class="content">
                    <p>Hi ${firstName}, your order is confirmed!</p>
                    <p>Thanks for your purchase. Your payment was successful, and we are now processing your order. We’ll notify you by email immediately its being shipped, and again once it is delivered. You can securely track your order anytime using the button below, or by visiting this link: <a href="${trackingUrl}">${trackingUrl}</a>.</p>
                    <a href="${trackingUrl}" class="tracking-button">Track My Order</a>
                    <p>Your Order ID is <strong>${orderUniqueID}</strong>, in case you need it for reference. We really appreciate you choosing ShopJani and are happy to have you with us!</p><br>
                    <p>For You Always,<br>;<strong>The ShopJani Team</strong></p>
                  </div>

                  <!-- Footer -->
                  <div class="footer">
                    <div class="social-icons">
                      <a href="#"><img src="https://img.icons8.com/ios-filled/50/twitter.png" alt="Twitter"></a>
                      <a href="#"><img src="https://img.icons8.com/ios-filled/50/instagram-new.png" alt="Instagram"></a>
                      <a href="#"><img src="https://img.icons8.com/ios-filled/50/tiktok.png" alt="TikTok"></a>
                      <a href="#"><img src="https://img.icons8.com/ios-filled/50/whatsapp.png" alt="WhatsApp"></a>
                    </div>
                    <p>© ${year} ShopJani. All rights reserved.</p>
                    <p><a href="mailto:support@shopjani.com" style="color: #007bff;">Customer support</a> | <a href="#" style="color: #007bff;">Privacy Policy</a> | <a href="#" style="color: #007bff;">Terms of Service</a></p>
                  </div>
                </div>
              
              </body
              </html>`
      };

      // Send the Confirmation email
      //await transporter.sendMail(mailOptions);


      console.log(`Transaction details inserted successfully for Order ID: ${OrderTrackingId}`);


      res.send(`thanks`);


      //Now Notify Vendor via email that there is a new order down here so they can start preparing delivery.......


    } else {
      console.log('Payment failed or pending');
      res.send('Payment failed or pending');
    }
  } catch (error) {
    console.error('Error handling IPN callback:', error.message || error);
    res.status(500).send('Error processing IPN callback ' + `Error:${error}`);
  }
};



module.exports = {
  createOrder,
  handleIPNCallback
};
