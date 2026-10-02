const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const db = require("./database");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-vendor-id, x-admin, x-session-id");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

app.use(express.static(path.join(__dirname, "../frontend")));

// =====================================================
// UTILS
// =====================================================
const getVendorByAuth = (req) => {
    const token = req.headers['x-vendor-token'];
    if (!token) return null;
    return db.prepare("SELECT * FROM vendors WHERE session_token = ?").get(token);
};
const getSessionId = (req) => req.headers['x-session-id'] || 'anonymous';

// =====================================================
// PRODUCTS
// =====================================================
app.get("/api/products", (req, res) => {
    try {
        const { search, category, sort, ids, vendor } = req.query;
        let query = "SELECT * FROM products WHERE 1=1";
        const params = [];

        if (ids) {
            const idList = ids.split(',').map(id => Number(id)).filter(id => !isNaN(id));
            if (idList.length > 0) {
                query += ` AND id IN (${idList.map(() => '?').join(',')})`;
                params.push(...idList);
            }
        }

        if (search) {
            query += " AND (name LIKE ? OR category LIKE ? OR vendor LIKE ? OR description LIKE ?)";
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }
        
        if (category && category !== 'All') {
            query += " AND category = ?";
            params.push(category);
        }

        if (vendor) {
            query += " AND vendor = ?";
            params.push(vendor);
        }

        if (sort === 'price_asc') query += " ORDER BY price ASC";
        else if (sort === 'price_desc') query += " ORDER BY price DESC";
        else if (sort === 'rating') query += " ORDER BY rating DESC";
        else if (sort === 'name_asc') query += " ORDER BY name ASC";
        else query += " ORDER BY created_at DESC";

        const products = db.prepare(query).all(...params);
        res.json(products);
    } catch (error) {
        console.error("Products error:", error);
        res.status(500).json({ success: false, message: "Unable to load products" });
    }
});

app.get("/api/products/:id", (req, res) => {
    try {
        const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });
        
        const reviews = db.prepare("SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC").all(product.id);
        
        // Get related products (same category, excluding current)
        const related = db.prepare("SELECT id, name, price, image, rating, vendor FROM products WHERE category = ? AND id != ? LIMIT 4").all(product.category, product.id);
        
        res.json({ ...product, reviews, related });
    } catch (error) {
        console.error("Single product error:", error);
        res.status(500).json({ success: false, message: "Unable to load product" });
    }
});

app.get("/api/categories", (req, res) => {
    try {
        const categories = db.prepare("SELECT DISTINCT category FROM products ORDER BY category").all().map(r => r.category);
        res.json(categories);
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to load categories" });
    }
});

app.post("/api/products/:id/reviews", (req, res) => {
    try {
        const { user_name, rating, review_text } = req.body;
        const productId = req.params.id;
        
        if (!user_name || !rating) return res.status(400).json({ success: false, message: "Name and rating required" });
        
        const ratingNum = Number(rating);
        if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
        }

        const product = db.prepare("SELECT id FROM products WHERE id = ?").get(productId);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        db.prepare("INSERT INTO reviews (product_id, user_name, rating, review_text) VALUES (?, ?, ?, ?)").run(productId, user_name, ratingNum, review_text || '');
        
        // Update product average rating
        const avg = db.prepare("SELECT AVG(rating) as avg FROM reviews WHERE product_id = ?").get(productId).avg;
        db.prepare("UPDATE products SET rating = ? WHERE id = ?").run(Math.round(avg * 10) / 10, productId);

        res.json({ success: true, message: "Review added" });
    } catch (error) {
        console.error("Review error:", error);
        res.status(500).json({ success: false, message: "Unable to add review" });
    }
});

// =====================================================
// WISHLIST
// =====================================================
app.get("/api/wishlist", (req, res) => {
    try {
        const sessionId = getSessionId(req);
        const items = db.prepare(`
            SELECT w.id as wishlist_id, w.added_at, p.* 
            FROM wishlist w 
            JOIN products p ON w.product_id = p.id 
            WHERE w.session_id = ?
            ORDER BY w.added_at DESC
        `).all(sessionId);
        res.json(items);
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to load wishlist" });
    }
});

app.post("/api/wishlist/:productId", (req, res) => {
    try {
        const sessionId = getSessionId(req);
        const productId = req.params.productId;
        
        const existing = db.prepare("SELECT id FROM wishlist WHERE session_id = ? AND product_id = ?").get(sessionId, productId);
        if (existing) {
            db.prepare("DELETE FROM wishlist WHERE id = ?").run(existing.id);
            return res.json({ success: true, action: 'removed', message: "Removed from wishlist" });
        }
        
        db.prepare("INSERT INTO wishlist (session_id, product_id) VALUES (?, ?)").run(sessionId, productId);
        res.json({ success: true, action: 'added', message: "Added to wishlist" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to update wishlist" });
    }
});

// =====================================================
// VENDOR PORTAL
// =====================================================
app.post("/api/vendors/register", async (req, res) => {
    try {
        const { name, business, email, phone, category, password } = req.body;
        if (!name || !business || !email || !phone || !category || !password) {
            return res.status(400).json({ success: false, message: "All fields required." });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
        }

        const existing = db.prepare("SELECT * FROM vendors WHERE email = ?").get(email.toLowerCase());
        if (existing) return res.status(409).json({ success: false, message: "Email already exists." });

        const hash = await bcrypt.hash(password, 10);
        const result = db.prepare(`INSERT INTO vendors (name, business, email, phone, category, password_hash) VALUES (?, ?, ?, ?, ?, ?)`).run(name, business, email.toLowerCase(), phone, category, hash);
        
        const newVendor = db.prepare("SELECT id, name, business, email, phone, category, status FROM vendors WHERE id = ?").get(result.lastInsertRowid);
        res.status(201).json({ success: true, message: "Registered successfully!", vendor: newVendor });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ success: false, message: "Registration failed." });
    }
});

app.post("/api/vendors/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "Email and password required." });

        const vendor = db.prepare("SELECT * FROM vendors WHERE email = ?").get(email.toLowerCase());
        if (!vendor || !(await bcrypt.compare(password, vendor.password_hash))) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        const token = require('crypto').randomBytes(16).toString('hex');
        db.prepare("UPDATE vendors SET session_token = ? WHERE id = ?").run(token, vendor.id);
        vendor.token = token;
        delete vendor.password_hash;
        delete vendor.session_token;
        res.json({ success: true, message: "Login successful!", vendor });
    } catch (error) {
        res.status(500).json({ success: false, message: "Login failed." });
    }
});

app.get("/api/vendors", (req, res) => {
    try {
        const vendors = db.prepare("SELECT id, name, business, category, status, registered_at FROM vendors ORDER BY registered_at DESC").all();
        // Add aggregate data for Compare Vendors
        const vendorsWithStats = vendors.map(v => {
            const stats = db.prepare("SELECT COUNT(*) as prodCount, AVG(rating) as avgRating, SUM(stock) as totalStock FROM products WHERE vendor = ?").get(v.business);
            const revenue = db.prepare("SELECT COALESCE(SUM(oi.subtotal), 0) as rev FROM order_items oi WHERE oi.vendor = ?").get(v.business);
            return { ...v, products: stats.prodCount, rating: stats.avgRating || 0, totalStock: stats.totalStock || 0, revenue: revenue.rev || 0 };
        });
        res.json(vendorsWithStats);
    } catch (error) {
        res.status(500).json({ success: false, message: "Unable to load vendors" });
    }
});

// VENDOR DASHBOARD & CRUD
app.get("/api/vendor/dashboard", (req, res) => {
    try {
        const vendor = getVendorByAuth(req);
        if (!vendor) return res.status(401).json({ success: false, message: "Unauthorized" });

        const products = db.prepare("SELECT * FROM products WHERE vendor = ?").all(vendor.business);
        
        // Orders containing vendor's products
        const orderItems = db.prepare(`
            SELECT oi.*, o.order_date, o.status as order_status, o.customer_name, o.customer_email, o.id as oid
            FROM order_items oi 
            JOIN orders o ON oi.order_id = o.id 
            WHERE oi.vendor = ? 
            ORDER BY o.order_date DESC
        `).all(vendor.business);
        
        const totalRevenue = orderItems.reduce((sum, item) => item.order_status !== 'Cancelled' ? sum + item.subtotal : sum, 0);
        const unitsSold = orderItems.reduce((sum, item) => item.order_status !== 'Cancelled' ? sum + item.quantity : sum, 0);
        const lowStockProducts = products.filter(p => p.stock <= 5);
        
        // Revenue by category
        const revenueByCategory = db.prepare(`
            SELECT p.category, COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN oi.subtotal ELSE 0 END), 0) as revenue
            FROM products p 
            LEFT JOIN order_items oi ON oi.product_id = p.id
            LEFT JOIN orders o ON oi.order_id = o.id
            WHERE p.vendor = ?
            GROUP BY p.category
        `).all(vendor.business);
        
        res.json({ 
            success: true, 
            products, 
            orders: orderItems, 
            totalRevenue,
            unitsSold,
            totalProducts: products.length,
            lowStockProducts,
            revenueByCategory
        });
    } catch (e) {
        console.error("Vendor dashboard error:", e);
        res.status(500).json({ success: false, message: "Error loading dashboard" });
    }
});

app.post("/api/vendor/products", (req, res) => {
    try {
        const vendor = getVendorByAuth(req);
        if (!vendor) return res.status(401).json({ success: false, message: "Unauthorized" });
        
        const { name, price, category, description, image, stock } = req.body;
        
        // Validation
        if (!name || !price || !category) {
            return res.status(400).json({ success: false, message: "Name, price, and category are required" });
        }
        if (Number(price) <= 0) {
            return res.status(400).json({ success: false, message: "Price must be positive" });
        }
        if (Number(stock) < 0) {
            return res.status(400).json({ success: false, message: "Stock cannot be negative" });
        }
        
        const result = db.prepare("INSERT INTO products (name, price, category, vendor, description, image, stock, rating) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
          .run(name, Number(price), category, vendor.business, description || '', image || '/images/products/backpack.jpg', Number(stock) || 0);
        
        const newProduct = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);
        res.json({ success: true, message: "Product added", product: newProduct });
    } catch (e) {
        console.error("Add product error:", e);
        res.status(500).json({ success: false, message: "Failed to add product" });
    }
});

app.put("/api/vendor/products/:id", (req, res) => {
    try {
        const vendor = getVendorByAuth(req);
        if (!vendor) return res.status(401).json({ success: false, message: "Unauthorized" });
        
        // Check ownership
        const prod = db.prepare("SELECT * FROM products WHERE id = ? AND vendor = ?").get(req.params.id, vendor.business);
        if (!prod) return res.status(403).json({ success: false, message: "Forbidden: not your product" });

        const { name, price, category, description, image, stock } = req.body;
        
        // Validation
        if (!name || !price || !category) {
            return res.status(400).json({ success: false, message: "Name, price, and category are required" });
        }
        if (Number(price) <= 0) {
            return res.status(400).json({ success: false, message: "Price must be positive" });
        }
        if (Number(stock) < 0) {
            return res.status(400).json({ success: false, message: "Stock cannot be negative" });
        }

        db.prepare("UPDATE products SET name=?, price=?, category=?, description=?, image=?, stock=? WHERE id=?")
          .run(name, Number(price), category, description || '', image || '', Number(stock) || 0, req.params.id);
        
        res.json({ success: true, message: "Product updated" });
    } catch (e) {
        console.error("Update product error:", e);
        res.status(500).json({ success: false, message: "Failed to update product" });
    }
});

app.delete("/api/vendor/products/:id", (req, res) => {
    try {
        const vendor = getVendorByAuth(req);
        if (!vendor) return res.status(401).json({ success: false, message: "Unauthorized" });
        
        const prod = db.prepare("SELECT * FROM products WHERE id = ? AND vendor = ?").get(req.params.id, vendor.business);
        if (!prod) return res.status(403).json({ success: false, message: "Forbidden: not your product" });

        db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
        res.json({ success: true, message: "Product deleted" });
    } catch (e) {
        res.status(500).json({ success: false, message: "Failed to delete product" });
    }
});

// =====================================================
// COUPONS
// =====================================================
app.get("/api/coupons/:code", (req, res) => {
    try {
        const coupon = db.prepare("SELECT * FROM coupons WHERE code = ? AND is_active = 1").get(req.params.code.toUpperCase());
        if (coupon) res.json({ success: true, discount_pct: coupon.discount_pct });
        else res.status(404).json({ success: false, message: "Invalid coupon code" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Coupon lookup failed" });
    }
});

// =====================================================
// ORDERS & CHECKOUT
// =====================================================
app.post("/api/orders", (req, res) => {
    try {
        const { customer, items, total, discount } = req.body;
        if (!customer || !customer.name || !customer.email || !customer.phone || !items || !items.length) {
            return res.status(400).json({ success: false, message: "Invalid order data" });
        }

        if (!customer.address) {
            return res.status(400).json({ success: false, message: "Delivery address is required" });
        }

        // Validate total is positive
        if (!total || total <= 0) {
            return res.status(400).json({ success: false, message: "Invalid order total" });
        }

        // Transaction for order placement and stock deduction
        const createOrderTx = db.transaction(() => {
            // Verify stock for all items
            for (const item of items) {
                const prod = db.prepare("SELECT id, stock, price, name FROM products WHERE id = ?").get(item.id);
                if (!prod) {
                    throw new Error(`Product "${item.name}" not found`);
                }
                if (prod.stock < item.quantity) {
                    throw new Error(`Insufficient stock for "${item.name}" (available: ${prod.stock}, requested: ${item.quantity})`);
                }
                if (item.quantity <= 0) {
                    throw new Error(`Invalid quantity for "${item.name}"`);
                }
            }

            const orderResult = db.prepare(`INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, total) VALUES (?, ?, ?, ?, ?)`)
                .run(customer.name, customer.email, customer.phone, customer.address, total);
            
            const orderId = orderResult.lastInsertRowid;
            
            for (const item of items) {
                db.prepare(`INSERT INTO order_items (order_id, product_id, product_name, vendor, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                  .run(orderId, item.id, item.name, item.vendor, item.price, item.quantity, item.price * item.quantity);
                
                // Deduct stock
                db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(item.quantity, item.id);
            }
            return orderId;
        });

        const orderId = createOrderTx();
        res.status(201).json({ success: true, message: "Order placed successfully!", orderId });
    } catch (error) {
        console.error("Order error:", error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Customer order lookup
app.get("/api/customer/orders", (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ success: false, message: "Email required" });

        const orders = db.prepare("SELECT * FROM orders WHERE customer_email = ? ORDER BY order_date DESC").all(email.toLowerCase());
        orders.forEach(o => o.items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id));
        res.json(orders);
    } catch (e) {
        res.status(500).json({ success: false, message: "Failed to load orders" });
    }
});

// Update order status (vendor can update their items' orders)
app.put("/api/orders/:id/status", (req, res) => {
    try {
        const vendor = getVendorByAuth(req);
        if (!vendor) return res.status(401).json({ success: false, message: "Unauthorized" });

        const { status } = req.body;
        const validStatuses = ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }
        
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        // Verify vendor has items in this order
        const vendorItems = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND vendor = ?").all(order.id, vendor.business);
        if (vendorItems.length === 0) return res.status(403).json({ success: false, message: "Forbidden: this order does not contain your products" });
        
        // If cancelling, restore stock for this vendor's items only
        if (status === 'Cancelled' && order.status !== 'Cancelled') {
            const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
            const cancelTx = db.transaction(() => {
                for (const item of items) {
                    db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(item.quantity, item.product_id);
                }
                db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
            });
            cancelTx();
        } else {
            db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
        }
        
        res.json({ success: true, message: `Order status updated to ${status}` });
    } catch (e) {
        console.error("Status update error:", e);
        res.status(500).json({ success: false, message: "Failed to update status" });
    }
});

// =====================================================
// ANALYTICS / ADMIN
// =====================================================
app.get("/api/analytics", (req, res) => {
    try {
        const totalRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as val FROM orders WHERE status != 'Cancelled'").get().val;
        const totalOrders = db.prepare("SELECT COUNT(*) as val FROM orders WHERE status != 'Cancelled'").get().val;
        const totalProducts = db.prepare("SELECT COUNT(*) as val FROM products").get().val;
        const totalVendors = db.prepare("SELECT COUNT(*) as val FROM vendors").get().val;
        const totalCustomers = db.prepare("SELECT COUNT(DISTINCT customer_email) as val FROM orders").get().val;
        const recentOrders = db.prepare("SELECT * FROM orders ORDER BY order_date DESC LIMIT 10").all();
        recentOrders.forEach(o => o.items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id));
        
        const topProducts = db.prepare(`
            SELECT oi.product_name, SUM(oi.quantity) as sold, SUM(oi.subtotal) as revenue 
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status != 'Cancelled'
            GROUP BY oi.product_id 
            ORDER BY sold DESC 
            LIMIT 5
        `).all();
        const lowStock = db.prepare("SELECT * FROM products WHERE stock <= 5 ORDER BY stock ASC").all();

        // Revenue by category
        const revenueByCategory = db.prepare(`
            SELECT p.category, 
                   COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN oi.subtotal ELSE 0 END), 0) as revenue, 
                   COUNT(DISTINCT CASE WHEN o.status != 'Cancelled' THEN oi.order_id END) as orders
            FROM products p 
            LEFT JOIN order_items oi ON oi.product_id = p.id
            LEFT JOIN orders o ON oi.order_id = o.id
            GROUP BY p.category
            ORDER BY revenue DESC
        `).all();

        // Revenue by vendor
        const revenueByVendor = db.prepare(`
            SELECT oi.vendor, 
                   COALESCE(SUM(oi.subtotal), 0) as revenue, 
                   SUM(oi.quantity) as unitsSold
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status != 'Cancelled'
            GROUP BY oi.vendor
            ORDER BY revenue DESC
        `).all();

        // Order status breakdown
        const ordersByStatus = db.prepare("SELECT status, COUNT(*) as count FROM orders GROUP BY status").all();

        // Best selling products
        const bestSelling = db.prepare(`
            SELECT oi.product_name, oi.vendor, 
                   SUM(oi.quantity) as totalSold, 
                   SUM(oi.subtotal) as totalRevenue, 
                   MAX(p.stock) as stock, MAX(p.image) as image
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.status != 'Cancelled'
            GROUP BY oi.product_id
            ORDER BY totalSold DESC
            LIMIT 10
        `).all();

        res.json({
            success: true,
            totalRevenue,
            totalOrders,
            totalProducts,
            totalVendors,
            totalCustomers,
            recentOrders,
            topProducts,
            lowStock,
            revenueByCategory,
            revenueByVendor,
            ordersByStatus,
            bestSelling
        });
    } catch (e) {
        console.error("Analytics error:", e);
        res.status(500).json({ success: false, message: "Failed to load analytics" });
    }
});

// =====================================================
// FRONTEND ROUTE (SPA fallback)
// =====================================================
app.use((req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => {
    console.log(`ShopSphere server running on http://localhost:${PORT}`);
});