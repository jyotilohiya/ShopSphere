const API_URL = "/api";

const app = {
    cart: JSON.parse(localStorage.getItem('shopsphere_cart')) || [],
    loggedInVendor: JSON.parse(localStorage.getItem('loggedInVendor')) || null,
    discountPct: 0,
    
    init() {
        this.updateCartBadge();
        
        if (this.loggedInVendor) {
            this.navigate('vendor-dashboard');
        } else {
            this.navigate('home');
        }
        
        // Expose to global window
        window.app = this;
    },
    
    navigate(view) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        
        if (view === 'home') {
            document.getElementById('view-home').classList.add('active');
            this.loadProducts();
            this.renderRecentlyViewed();
        } 
        else if (view === 'cart') {
            document.getElementById('view-cart').classList.add('active');
            this.renderCart();
        }
        else if (view === 'checkout') {
            if (this.cart.length === 0) {
                alert("Your cart is empty!");
                return this.navigate('home');
            }
            document.getElementById('view-checkout').classList.add('active');
            this.renderCheckout();
        }
        else if (view === 'vendor-portal') {
            if (this.loggedInVendor) {
                this.navigate('vendor-dashboard');
            } else {
                document.getElementById('view-vendor-portal').classList.add('active');
            }
        }
        else if (view === 'vendor-dashboard') {
            if (!this.loggedInVendor) return this.navigate('vendor-portal');
            document.getElementById('view-vendor-dashboard').classList.add('active');
            document.getElementById('dash-business-name').textContent = this.loggedInVendor.business;
            this.loadVendorDashboard();
        }
        else if (view === 'admin-dashboard') {
            document.getElementById('view-admin-dashboard').classList.add('active');
            this.loadAdminAnalytics();
        }
    },
    
    // ===============================================
    // CUSTOMER / PRODUCTS
    // ===============================================
    async loadProducts() {
        const search = document.getElementById('global-search').value;
        const category = document.getElementById('filter-category').value;
        const sort = document.getElementById('sort-by').value;
        
        try {
            let url = `${API_URL}/products?sort=${sort}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            if (category !== 'All') url += `&category=${encodeURIComponent(category)}`;
            
            const res = await fetch(url);
            const products = await res.json();
            
            const grid = document.getElementById('products-grid');
            grid.innerHTML = '';
            
            if (!products.length) {
                grid.innerHTML = '<p>No products found.</p>';
                return;
            }
            
            products.forEach(p => {
                let stockBadge = '';
                if (p.stock <= 0) stockBadge = '<span class="stock-badge stock-out">Out of Stock</span>';
                else if (p.stock <= 5) stockBadge = `<span class="stock-badge stock-low">Only ${p.stock} left</span>`;
                else stockBadge = '<span class="stock-badge stock-ok">In Stock</span>';

                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    ${stockBadge}
                    <img src="${p.image || '/images/products/placeholder.jpg'}" class="product-img" onclick="app.openProductModal(${p.id})">
                    <div class="product-info">
                        <div class="product-category">${p.category}</div>
                        <div class="product-title" onclick="app.openProductModal(${p.id})">${p.name}</div>
                        <div class="product-vendor">By ${p.vendor}</div>
                        <div class="product-rating">★ ${Number(p.rating).toFixed(1)}</div>
                        <div class="product-price">₹${p.price.toLocaleString('en-IN')}</div>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-primary" ${p.stock <= 0 ? 'disabled' : ''} onclick="app.addToCart(${p.id}, '${p.name}', ${p.price}, '${p.vendor}', '${p.image}')">Add to Cart</button>
                    </div>
                `;
                grid.appendChild(card);
            });
            
        } catch (e) {
            console.error(e);
        }
    },
    
    searchProducts() {
        this.navigate('home');
        this.loadProducts();
    },

    async openProductModal(id) {
        try {
            const res = await fetch(`${API_URL}/products/${id}`);
            const data = await res.json();
            if(!data.success && data.message) throw new Error(data.message);
            
            this.addRecentlyViewed(data);
            this.renderRecentlyViewed();

            const modal = document.getElementById('product-modal');
            const content = document.getElementById('pd-content');
            
            content.innerHTML = `
                <div class="product-details-img">
                    <img src="${data.image || '/images/products/placeholder.jpg'}">
                </div>
                <div class="product-details-info">
                    <h2>${data.name}</h2>
                    <div class="product-category">${data.category} | Sold by ${data.vendor}</div>
                    <div class="product-rating" style="font-size:1.2rem; margin:0.5rem 0;">★ ${Number(data.rating).toFixed(1)}</div>
                    <div class="price">₹${data.price.toLocaleString('en-IN')}</div>
                    <p style="margin-bottom:1.5rem; color:var(--text-muted);">${data.description || 'No description available.'}</p>
                    <div style="margin-bottom: 1rem;"><strong>Availability:</strong> ${data.stock > 0 ? data.stock + ' in stock' : '<span style="color:red">Out of stock</span>'}</div>
                    <button class="btn btn-primary" style="width:100%; padding:1rem; font-size:1.1rem;" ${data.stock <= 0 ? 'disabled' : ''} onclick="app.addToCart(${data.id}, '${data.name}', ${data.price}, '${data.vendor}', '${data.image}')">Add to Cart</button>
                    
                    <div class="review-section">
                        <h3>Reviews</h3>
                        <div style="max-height: 200px; overflow-y: auto; margin-bottom: 1rem;">
                            ${data.reviews && data.reviews.length ? data.reviews.map(r => `
                                <div style="margin-bottom:0.5rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border);">
                                    <div style="font-weight:bold;">${r.user_name} <span style="color:var(--warning)">★ ${r.rating}</span></div>
                                    <div style="font-size:0.9rem;">${r.review_text}</div>
                                </div>
                            `).join('') : '<p style="font-size:0.9rem; color:var(--text-muted);">No reviews yet.</p>'}
                        </div>
                        <div class="review-form">
                            <input type="text" id="rev-name" class="form-control" placeholder="Your Name" style="padding:0.5rem">
                            <select id="rev-rating" class="form-control" style="padding:0.5rem">
                                <option value="5">5 - Excellent</option>
                                <option value="4">4 - Good</option>
                                <option value="3">3 - Average</option>
                                <option value="2">2 - Poor</option>
                                <option value="1">1 - Terrible</option>
                            </select>
                            <textarea id="rev-text" class="form-control" placeholder="Your Review" rows="2"></textarea>
                            <button class="btn btn-secondary" onclick="app.submitReview(${data.id})">Submit Review</button>
                        </div>
                    </div>
                </div>
            `;
            modal.classList.add('active');
        } catch (e) {
            alert("Could not load product details.");
        }
    },

    closeModal(id) {
        document.getElementById(id).classList.remove('active');
    },
    
    async submitReview(productId) {
        const name = document.getElementById('rev-name').value;
        const rating = document.getElementById('rev-rating').value;
        const text = document.getElementById('rev-text').value;
        
        if(!name) return alert("Name is required");
        
        try {
            await fetch(`${API_URL}/products/${productId}/reviews`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_name: name, rating, review_text: text })
            });
            alert("Review submitted!");
            this.openProductModal(productId); // reload modal
        } catch (e) {
            alert("Error submitting review");
        }
    },

    // ===============================================
    // RECENTLY VIEWED & WISHLIST
    // ===============================================
    addRecentlyViewed(product) {
        let rv = JSON.parse(localStorage.getItem('shopsphere_rv')) || [];
        rv = rv.filter(p => p.id !== product.id); // remove if exists
        rv.unshift({ id: product.id, name: product.name }); // add to top
        if(rv.length > 5) rv.pop(); // keep 5
        localStorage.setItem('shopsphere_rv', JSON.stringify(rv));
    },

    renderRecentlyViewed() {
        const rv = JSON.parse(localStorage.getItem('shopsphere_rv')) || [];
        const container = document.getElementById('recently-viewed');
        if(!container) return;
        
        if(rv.length === 0) {
            container.innerHTML = '<span style="color:var(--text-muted)">None</span>';
            return;
        }
        
        container.innerHTML = rv.map(p => `
            <div style="margin-bottom:0.5rem; cursor:pointer; color:var(--primary);" onclick="app.openProductModal(${p.id})">
                • ${p.name}
            </div>
        `).join('');
    },

    // ===============================================
    // CART
    // ===============================================
    addToCart(id, name, price, vendor, image) {
        const existing = this.cart.find(c => c.id === id);
        if (existing) {
            existing.quantity++;
        } else {
            this.cart.push({ id, name, price, vendor, image, quantity: 1 });
        }
        this.saveCart();
        alert(`${name} added to cart!`);
    },
    
    updateQuantity(id, change) {
        const item = this.cart.find(c => c.id === id);
        if(!item) return;
        item.quantity += change;
        if(item.quantity <= 0) {
            this.cart = this.cart.filter(c => c.id !== id);
        }
        this.saveCart();
        if(document.getElementById('view-cart').classList.contains('active')) this.renderCart();
    },

    saveCart() {
        localStorage.setItem('shopsphere_cart', JSON.stringify(this.cart));
        this.updateCartBadge();
    },
    
    updateCartBadge() {
        const count = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        document.getElementById('cart-badge').textContent = count;
    },
    
    renderCart() {
        const container = document.getElementById('cart-items-container');
        if (this.cart.length === 0) {
            container.innerHTML = '<p>Your cart is empty.</p>';
            this.updateCartTotals();
            return;
        }
        
        container.innerHTML = this.cart.map(item => `
            <div class="cart-item">
                <img src="${item.image || '/images/products/placeholder.jpg'}">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">Vendor: ${item.vendor}</div>
                    <div style="font-weight:bold;">₹${item.price.toLocaleString('en-IN')}</div>
                </div>
                <div class="qty-ctrl">
                    <button onclick="app.updateQuantity(${item.id}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button onclick="app.updateQuantity(${item.id}, 1)">+</button>
                </div>
                <div style="margin-left: 1rem; font-weight:bold; min-width: 80px; text-align:right;">
                    ₹${(item.price * item.quantity).toLocaleString('en-IN')}
                </div>
            </div>
        `).join('');
        
        this.updateCartTotals();
    },
    
    updateCartTotals() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const discountAmt = (subtotal * this.discountPct) / 100;
        const total = subtotal - discountAmt;
        
        const format = num => `₹${num.toLocaleString('en-IN')}`;
        
        const subEl = document.getElementById('cart-subtotal');
        const discEl = document.getElementById('cart-discount');
        const totEl = document.getElementById('cart-total');
        
        if(subEl) subEl.textContent = format(subtotal);
        if(discEl) discEl.textContent = format(discountAmt);
        if(totEl) totEl.textContent = format(total);
        
        const chkBtn = document.getElementById('checkout-total-btn');
        if(chkBtn) chkBtn.textContent = format(total);
    },
    
    async applyCoupon() {
        const code = document.getElementById('coupon-code').value.trim();
        const msg = document.getElementById('coupon-msg');
        if(!code) {
            this.discountPct = 0;
            this.updateCartTotals();
            msg.innerHTML = '';
            return;
        }
        
        try {
            const res = await fetch(`${API_URL}/coupons/${code}`);
            const data = await res.json();
            if(data.success) {
                this.discountPct = data.discount_pct;
                msg.innerHTML = `<span style="color:var(--success)">Coupon applied! ${this.discountPct}% off</span>`;
                this.updateCartTotals();
            } else {
                this.discountPct = 0;
                msg.innerHTML = `<span style="color:var(--danger)">Invalid coupon code</span>`;
                this.updateCartTotals();
            }
        } catch(e) {
            console.error(e);
        }
    },

    // ===============================================
    // CHECKOUT
    // ===============================================
    renderCheckout() {
        this.updateCartTotals();
    },
    
    async placeOrder(e) {
        e.preventDefault();
        
        const customer = {
            name: document.getElementById('checkout-name').value,
            email: document.getElementById('checkout-email').value,
            phone: document.getElementById('checkout-phone').value,
            address: document.getElementById('checkout-address').value
        };
        
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const total = subtotal - ((subtotal * this.discountPct) / 100);
        
        try {
            const res = await fetch(`${API_URL}/orders`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ customer, items: this.cart, total, discount: this.discountPct })
            });
            const data = await res.json();
            
            if(data.success) {
                document.getElementById('checkout-success').textContent = `Order placed successfully! Order ID: #${data.orderId}`;
                document.getElementById('checkout-success').classList.remove('d-none');
                document.getElementById('checkout-error').classList.add('d-none');
                document.getElementById('checkout-form').reset();
                
                this.cart = [];
                this.discountPct = 0;
                this.saveCart();
                
                setTimeout(() => this.navigate('home'), 3000);
            } else {
                throw new Error(data.message);
            }
        } catch(e) {
            document.getElementById('checkout-error').textContent = e.message;
            document.getElementById('checkout-error').classList.remove('d-none');
        }
    },

    // ===============================================
    // VENDOR AUTH
    // ===============================================
    async vendorLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        try {
            const res = await fetch(`${API_URL}/vendors/login`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            
            if(data.success) {
                this.loggedInVendor = data.vendor;
                localStorage.setItem('loggedInVendor', JSON.stringify(data.vendor));
                document.getElementById('vendor-login-form').reset();
                document.getElementById('login-error').classList.add('d-none');
                this.navigate('vendor-dashboard');
            } else {
                throw new Error(data.message);
            }
        } catch(e) {
            const err = document.getElementById('login-error');
            err.textContent = e.message;
            err.classList.remove('d-none');
        }
    },
    
    async vendorRegister(e) {
        e.preventDefault();
        const body = {
            name: document.getElementById('reg-name').value,
            business: document.getElementById('reg-business').value,
            email: document.getElementById('reg-email').value,
            phone: document.getElementById('reg-phone').value,
            category: document.getElementById('reg-category').value,
            password: document.getElementById('reg-password').value
        };
        
        try {
            const res = await fetch(`${API_URL}/vendors/register`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            const data = await res.json();
            
            if(data.success) {
                document.getElementById('reg-success').textContent = "Registration successful! You can now login.";
                document.getElementById('reg-success').classList.remove('d-none');
                document.getElementById('reg-error').classList.add('d-none');
                document.getElementById('vendor-reg-form').reset();
            } else {
                throw new Error(data.message);
            }
        } catch(e) {
            document.getElementById('reg-error').textContent = e.message;
            document.getElementById('reg-error').classList.remove('d-none');
        }
    },
    
    vendorLogout() {
        this.loggedInVendor = null;
        localStorage.removeItem('loggedInVendor');
        this.navigate('vendor-portal');
    },

    // ===============================================
    // VENDOR DASHBOARD
    // ===============================================
    _vendorAuthHeaders() {
        return { 'x-vendor-token': this.loggedInVendor?.token || '' };
    },

    switchVendorTab(tab) {
        document.querySelectorAll('.vendor-tab').forEach(el => el.classList.add('d-none'));
        document.querySelectorAll('.dashboard-nav button').forEach(el => el.classList.remove('active'));
        
        document.getElementById(`vendor-${tab}`).classList.remove('d-none');
        document.getElementById(`tab-${tab}`).classList.add('active');
    },
    
    async loadVendorDashboard() {
        try {
            const res = await fetch(`${API_URL}/vendor/dashboard`, {
                headers: this._vendorAuthHeaders()
            });
            const data = await res.json();
            
            if(!data.success) {
                if(data.message === 'Unauthorized') this.vendorLogout();
                return;
            }
            
            // Overview stats
            document.getElementById('vd-rev').textContent = `₹${data.totalRevenue.toLocaleString('en-IN')}`;
            document.getElementById('vd-ord').textContent = data.orders.length;
            document.getElementById('vd-prod').textContent = data.totalProducts;
            document.getElementById('vd-units').textContent = data.unitsSold || 0;
            
            // Low stock products
            const lowTbody = document.querySelector('#vd-low-stock-table tbody');
            if (data.lowStockProducts && data.lowStockProducts.length) {
                lowTbody.innerHTML = data.lowStockProducts.map(p => `
                    <tr>
                        <td>${p.name}</td>
                        <td><span class="status-badge status-cancelled">${p.stock}</span></td>
                    </tr>
                `).join('');
            } else {
                lowTbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:var(--text-muted);">All products are well-stocked</td></tr>';
            }

            // Recent orders (last 5)
            const recentTbody = document.querySelector('#vd-recent-orders-table tbody');
            const recentOrders = data.orders.slice(0, 5);
            if (recentOrders.length) {
                recentTbody.innerHTML = recentOrders.map(o => `
                    <tr>
                        <td>#${o.order_id}</td>
                        <td>${new Date(o.order_date).toLocaleDateString()}</td>
                        <td>${o.product_name}</td>
                        <td>${o.quantity}</td>
                    </tr>
                `).join('');
            } else {
                recentTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No orders yet</td></tr>';
            }
            
            // Keep references for filtering
            this.vendorProducts = data.products;
            this.vendorOrders = data.orders;
            
            // Populate category filter dropdown
            const catSelect = document.getElementById('vd-product-category');
            if (catSelect) {
                const categories = [...new Set(data.products.map(p => p.category))];
                catSelect.innerHTML = '<option value="All">All Categories</option>' + 
                    categories.map(c => `<option value="${c}">${c}</option>`).join('');
            }
            
            // Render tables
            this.renderVendorProducts(data.products);
            this.renderVendorOrders(data.orders);
            
        } catch(e) {
            console.error(e);
        }
    },

    // --- Products ---
    renderVendorProducts(products) {
        const pTbody = document.querySelector('#vd-products-table tbody');
        if (!products.length) {
            pTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No products found. Add your first product!</td></tr>';
            return;
        }
        pTbody.innerHTML = products.map(p => `
            <tr>
                <td><img src="${p.image || '/images/products/placeholder.jpg'}" width="50" style="border-radius:4px"></td>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td>₹${p.price.toLocaleString('en-IN')}</td>
                <td><span class="status-badge ${p.stock > 5 ? 'status-delivered' : p.stock > 0 ? 'status-processing' : 'status-cancelled'}">${p.stock}</span></td>
                <td>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-secondary" onclick="app.editVendorProduct(${p.id})">Edit</button>
                        <button class="btn btn-danger" onclick="app.deleteVendorProduct(${p.id})">Del</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },
    
    filterVendorProducts() {
        const search = (document.getElementById('vd-product-search')?.value || '').toLowerCase();
        const category = document.getElementById('vd-product-category')?.value || 'All';
        
        let filtered = this.vendorProducts || [];
        if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search));
        if (category !== 'All') filtered = filtered.filter(p => p.category === category);
        
        this.renderVendorProducts(filtered);
    },

    // --- Orders ---
    _statusBadgeClass(status) {
        const map = { 'Placed': 'status-placed', 'Processing': 'status-processing', 'Shipped': 'status-shipped', 'Delivered': 'status-delivered', 'Cancelled': 'status-cancelled' };
        return map[status] || 'status-placed';
    },

    renderVendorOrders(orders) {
        const oTbody = document.querySelector('#vd-orders-table tbody');
        if (!orders.length) {
            oTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:2rem;">No orders found</td></tr>';
            return;
        }
        oTbody.innerHTML = orders.map(o => `
            <tr>
                <td>#${o.order_id}</td>
                <td>${new Date(o.order_date).toLocaleDateString()}</td>
                <td>${o.product_name}</td>
                <td>${o.quantity}</td>
                <td>₹${o.subtotal.toLocaleString('en-IN')}</td>
                <td>${o.customer_name}</td>
                <td><span class="status-badge ${this._statusBadgeClass(o.order_status)}">${o.order_status}</span></td>
                <td><button class="btn btn-secondary" onclick="app.openOrderModal(${o.order_id}, '${o.order_status}')">Manage</button></td>
            </tr>
        `).join('');
    },

    filterVendorOrders() {
        const search = (document.getElementById('vd-order-search')?.value || '').toLowerCase();
        const status = document.getElementById('vd-order-status')?.value || 'All';
        
        let filtered = this.vendorOrders || [];
        if (search) filtered = filtered.filter(o => `#${o.order_id}`.includes(search) || o.product_name.toLowerCase().includes(search) || o.customer_name.toLowerCase().includes(search));
        if (status !== 'All') filtered = filtered.filter(o => o.order_status === status);
        
        this.renderVendorOrders(filtered);
    },

    openOrderModal(orderId, currentStatus) {
        this._currentOrderId = orderId;
        document.getElementById('vom-id').textContent = `#${orderId}`;
        
        // Fill details from cached orders
        const items = (this.vendorOrders || []).filter(o => o.order_id === orderId);
        const detailsDiv = document.getElementById('vom-details');
        if (items.length) {
            const first = items[0];
            detailsDiv.innerHTML = `
                <p><strong>Customer:</strong> ${first.customer_name} (${first.customer_email})</p>
                <p><strong>Date:</strong> ${new Date(first.order_date).toLocaleDateString()}</p>
                <div class="table-wrapper" style="margin-top:0.5rem;">
                    <table>
                        <thead><tr><th>Product</th><th>Qty</th><th>Subtotal</th></tr></thead>
                        <tbody>
                            ${items.map(i => `<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>₹${i.subtotal.toLocaleString('en-IN')}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        document.getElementById('vom-status').value = currentStatus;
        document.getElementById('vendor-order-modal').classList.add('active');
    },

    async updateOrderStatus() {
        const status = document.getElementById('vom-status').value;
        try {
            const res = await fetch(`${API_URL}/orders/${this._currentOrderId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...this._vendorAuthHeaders() },
                body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (data.success) {
                this.closeModal('vendor-order-modal');
                this.loadVendorDashboard();
            } else {
                alert(data.message || 'Failed to update status');
            }
        } catch(e) {
            alert('Error updating order status');
        }
    },

    showAddProductModal() {
        document.getElementById('vpm-form').reset();
        document.getElementById('vpm-id').value = '';
        document.getElementById('vpm-title').textContent = 'Add Product';
        document.getElementById('vendor-product-modal').classList.add('active');
    },
    
    editVendorProduct(id) {
        const p = this.vendorProducts.find(x => x.id === id);
        if(!p) return;
        
        document.getElementById('vpm-id').value = p.id;
        document.getElementById('vpm-name').value = p.name;
        document.getElementById('vpm-price').value = p.price;
        document.getElementById('vpm-stock').value = p.stock;
        document.getElementById('vpm-category').value = p.category;
        document.getElementById('vpm-image').value = p.image;
        document.getElementById('vpm-desc').value = p.description;
        
        document.getElementById('vpm-title').textContent = 'Edit Product';
        document.getElementById('vendor-product-modal').classList.add('active');
    },
    
    async saveVendorProduct(e) {
        e.preventDefault();
        const id = document.getElementById('vpm-id').value;
        const body = {
            name: document.getElementById('vpm-name').value,
            price: Number(document.getElementById('vpm-price').value),
            stock: Number(document.getElementById('vpm-stock').value),
            category: document.getElementById('vpm-category').value,
            image: document.getElementById('vpm-image').value,
            description: document.getElementById('vpm-desc').value,
        };

        if (!body.name || !body.price || !body.category) {
            return alert('Name, price, and category are required.');
        }
        if (body.price <= 0) return alert('Price must be positive.');
        if (body.stock < 0) return alert('Stock cannot be negative.');
        
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/vendor/products/${id}` : `${API_URL}/vendor/products`;
        
        try {
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...this._vendorAuthHeaders()
                },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                this.closeModal('vendor-product-modal');
                this.loadVendorDashboard();
            } else {
                alert(data.message || 'Error saving product');
            }
        } catch(e) {
            alert("Error saving product");
        }
    },
    
    async deleteVendorProduct(id) {
        if(!confirm("Are you sure you want to delete this product?")) return;
        try {
            const res = await fetch(`${API_URL}/vendor/products/${id}`, {
                method: 'DELETE',
                headers: this._vendorAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                this.loadVendorDashboard();
            } else {
                alert(data.message || 'Failed to delete product');
            }
        } catch(e) {
            alert("Error deleting product");
        }
    },

    // ===============================================
    // ADMIN DASHBOARD
    // ===============================================
    async loadAdminAnalytics() {
        try {
            const res = await fetch(`${API_URL}/analytics`);
            const data = await res.json();
            
            if(!data.success) return;
            
            document.getElementById('ad-rev').textContent = `₹${data.totalRevenue.toLocaleString('en-IN')}`;
            document.getElementById('ad-ord').textContent = data.totalOrders;
            document.getElementById('ad-prod').textContent = data.totalProducts;
            document.getElementById('ad-vend').textContent = data.totalVendors;
            
            const insights = document.getElementById('ad-insights');
            insights.innerHTML = `
                <li><strong>Top Category (Estimate):</strong> Electronics is performing highly.</li>
                <li><strong>Critical Stock:</strong> ${data.lowStock.length} items are critically low in stock.</li>
                <li><strong>Vendor Activity:</strong> ${data.totalVendors} registered vendors on the platform.</li>
                <li><strong>Avg Order Value:</strong> ₹${data.totalOrders ? (data.totalRevenue / data.totalOrders).toFixed(2) : 0}</li>
            `;
            
            const tbody = document.querySelector('#ad-top-products tbody');
            tbody.innerHTML = data.topProducts.map(tp => `
                <tr>
                    <td>${tp.product_name}</td>
                    <td><strong>${tp.sold}</strong> units</td>
                </tr>
            `).join('');
            
        } catch(e) {
            console.error(e);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});