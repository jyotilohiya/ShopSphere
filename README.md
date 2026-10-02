# ShopSphere - Multi-Vendor E-Commerce Platform with Analytics

## Overview
ShopSphere is a feature-rich, responsive multi-vendor e-commerce platform. It provides a robust marketplace where multiple vendors can register, manage their storefronts, and sell products, while customers enjoy a seamless shopping experience with smart recommendations, advanced search, and dynamic cart capabilities.

## Features
### Customer Features
- **Dynamic Product Discovery**: Search by name, filter by category, and sort by price or rating.
- **Shopping Cart & Checkout**: Real-time cart updates with stock validation and coupon code processing.
- **Product Details & Reviews**: Dedicated product view with detailed descriptions, stock availability, and a customer review/rating system.
- **Recently Viewed & Recommendations**: Smart, rule-based tracking of recently viewed products.

### Vendor Features
- **Secure Authentication**: Vendor registration and login secured with `bcrypt` password hashing.
- **Vendor Dashboard**: Dedicated isolated portal for vendors to track their revenue, orders, and total products.
- **Product Management (CRUD)**: Vendors can independently create, edit, and delete their products. 
- **Order Management**: Vendors only see and manage orders containing their own products.

### Admin Features
- **Platform Analytics Dashboard**: Global view of total revenue, orders, products, and registered vendors.
- **Business Insights**: Identifies top-selling products, critically low stock items, and overall platform performance.

## Technology Stack
- **Frontend**: HTML5, CSS3 (Modern CSS variables, Flexbox/Grid), Vanilla JavaScript (SPA architecture)
- **Backend**: Node.js, Express.js
- **Database**: SQLite (via `better-sqlite3`)
- **Security**: `bcrypt` for password hashing

## Architecture
The application follows a lightweight Single Page Application (SPA) architecture on the frontend communicating via RESTful JSON APIs with the Express backend. The database uses synchronous local file storage (SQLite) avoiding complex external database dependencies.

## Project Structure
```text
/
├── backend/
│   ├── data/
│   │   └── shopsphere.db     # SQLite Database File
│   ├── database.js           # Database initialization & schema creation
│   ├── server.js             # Express.js REST API
├── frontend/
│   ├── images/products/      # High-quality realistic product images
│   ├── index.html            # Main SPA layout and UI views
│   ├── script.js             # SPA routing, state management, API integration
│   ├── style.css             # Modern UI styling
├── package.json
└── README.md
```

## Database
Uses a relational SQLite schema with explicitly enforced Foreign Keys:
- `products`: Product catalog (id, name, price, category, vendor, description, image, stock, rating)
- `vendors`: Vendor profiles and authentication (id, business, email, password_hash)
- `orders`: Top-level customer order details (id, customer_name, total)
- `order_items`: Line items linking products to orders and tracking sub-vendor sales
- `reviews`: Customer product reviews and ratings
- `coupons`: Active discount codes (e.g. SHOP10, SAVE20)

## API Endpoints
- `GET /api/products` - Fetch products (supports search, sort, filters)
- `GET /api/products/:id` - Fetch single product and its reviews
- `POST /api/products/:id/reviews` - Submit a review
- `POST /api/vendors/register` - Register a new vendor
- `POST /api/vendors/login` - Authenticate vendor
- `GET /api/vendor/dashboard` - Vendor-specific dashboard data
- `POST / PUT / DELETE /api/vendor/products` - Vendor product CRUD
- `POST /api/orders` - Place a new order
- `GET /api/analytics` - Platform-wide statistics
- `GET /api/coupons/:code` - Validate discount code

## Installation & How to Run
1. Ensure Node.js is installed.
2. Clone the repository and navigate to the project directory.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the application:
   ```bash
   npm start
   ```
5. Open your browser and navigate to: [http://localhost:5000](http://localhost:5000)

## Testing
- **Customer Flow**: Add items to the cart, apply a coupon (`SHOP10`), and complete checkout.
- **Vendor Flow**: Register as a vendor, log in, add a new product with stock, and verify it appears on the homepage.
- **Admin Flow**: Click 'Admin' in the navigation bar to view aggregated analytics.

## Security
- MongoDB Atlas has been completely removed to prevent unauthorized network exposure.
- All vendor passwords are one-way hashed using `bcrypt` (10 salt rounds).
- Database uses `better-sqlite3` parameterized queries natively to prevent SQL Injection attacks.
- Frontend sanitizes inputs implicitly via `textContent` assignment and backend validation.

## Future Enhancements
- Integration of a real payment gateway (Stripe/Razorpay).
- Email notifications for order confirmations.
- JWT-based authentication for persistent vendor sessions.
