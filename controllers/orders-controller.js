let orders = [
    {
        id: "JKN-1081",
        customer_info: {
            firstname: "jake",
            lastname: "jimston",
            email: "emailsample@gmail.com",
            telephone: "+2547001234567",
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
        transaction_code: "TXN123456",
        payment_completed: true,
        status: "pending",
        order_tracking_id: "b77446f1-5724-4be3-a3de-db9d0238c470",
        order_timestamp: "2025-07-03T18:31:56.007Z",
        items: [
            {
                id: "8RCYGRKT111",
                name: "The Milano Handbag",
                price: 395.00,
                discount: 0,
                quantity: 2
            },
            {
                id: "9RPNGJDM3N2",
                name: "Florentine Silk Scarf",
                price: 185.00,
                discount: 10,
                quantity: 1
            }
        ],
        date: "2025-07-03"
    }
];


const fetchOrders = async (req, res) => {
     res.json(orders);
}

module.exports = { fetchOrders };

