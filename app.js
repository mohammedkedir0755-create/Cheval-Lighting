"use strict";

/* STORAGE */

const PRODUCTS_KEY = "cheval_products_v1";
const SALES_KEY = "cheval_sales_v1";
const CART_KEY = "cheval_cart_v1";
const WISH_KEY = "cheval_wishlist_v1";

let products = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "[]");
let sales = JSON.parse(localStorage.getItem(SALES_KEY) || "[]");
let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
let wishlist = JSON.parse(localStorage.getItem(WISH_KEY) || "[]");

let currentCategory = "All";
let language = localStorage.getItem("cheval_language") || "en";

const money = value =>
  Number(value || 0).toLocaleString("en-US") + " ETB";

function saveAll() {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  localStorage.setItem(SALES_KEY, JSON.stringify(sales));
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  localStorage.setItem(WISH_KEY, JSON.stringify(wishlist));
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function createId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* LANGUAGE */

function toggleLanguage() {
  language = language === "en" ? "am" : "en";
  localStorage.setItem("cheval_language", language);

  document.querySelectorAll("[data-en][data-am]").forEach(element => {
    element.textContent = element.dataset[language];
  });

  const search = document.getElementById("searchInput");

  if (search) {
    search.placeholder = language === "en"
      ? "Search products..."
      : "ምርቶችን ይፈልጉ...";
  }

  const button = document.getElementById("languageBtn");

  if (button) {
    button.textContent = language === "en" ? "EN | አማ" : "አማ | EN";
  }

  renderProducts();
}

/* CUSTOMER PRODUCTS */

function renderProducts() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  const search = (
    document.getElementById("searchInput")?.value || ""
  ).toLowerCase();

  const filtered = products.filter(product => {
    const matchesSearch =
      String(product.name || "").toLowerCase().includes(search) ||
      String(product.category || "").toLowerCase().includes(search) ||
      String(product.description || "").toLowerCase().includes(search);

    const matchesCategory =
      currentCategory === "All" ||
      product.category === currentCategory;

    return matchesSearch && matchesCategory;
  });

  if (!filtered.length) {
    grid.innerHTML = '<p class="empty-message">No products found yet.</p>';
  } else {
    grid.innerHTML = filtered.map(product => {
      const hasPrice =
        product.price !== null &&
        product.price !== undefined &&
        product.price !== "";

      const available = Number(product.stock) > 0;

      return `
        <article class="product-card">
          <img src="${product.photo}" alt="${escapeHTML(product.name)}">

          <div class="product-info">
            <h3>${escapeHTML(product.name)}</h3>

            <p>${escapeHTML(product.category)}</p>

            ${
              product.description
                ? `<p>${escapeHTML(product.description)}</p>`
                : ""
            }

            ${
              hasPrice
                ? `<p class="product-price">${money(product.price)}</p>`
                : ""
            }

            <div class="product-actions">
              ${
                available
                  ? `<button onclick="addToCart('${product.id}')">Add to Cart</button>`
                  : `<button disabled>Unavailable</button>`
              }

              <button onclick="toggleWishlist('${product.id}')">
                ${wishlist.includes(product.id) ? "♥ Saved" : "♡ Wishlist"}
              </button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  renderCategories();
  renderWishlist();
  renderCart();
}

function renderCategories() {
  const area = document.getElementById("categories");
  if (!area) return;

  const categories = ["All", ...new Set(products.map(p => p.category))];

  area.innerHTML = categories.map(category => `
    <button
      class="category-btn ${currentCategory === category ? "active" : ""}"
      onclick="selectCategory('${escapeHTML(category)}')">
      ${escapeHTML(category)}
    </button>
  `).join("");
}

function selectCategory(category) {
  currentCategory = category;
  renderProducts();
}

/* WISHLIST */

function toggleWishlist(id) {
  if (wishlist.includes(id)) {
    wishlist = wishlist.filter(item => item !== id);
  } else {
    wishlist.push(id);
  }

  saveAll();
  renderProducts();
}

function renderWishlist() {
  const area = document.getElementById("wishlistGrid");
  if (!area) return;

  const saved = products.filter(p => wishlist.includes(p.id));

  area.innerHTML = saved.length
    ? saved.map(product => `
        <article class="product-card">
          <img src="${product.photo}" alt="${escapeHTML(product.name)}">

          <div class="product-info">
            <h3>${escapeHTML(product.name)}</h3>

            ${
              product.price !== null &&
              product.price !== undefined &&
              product.price !== ""
                ? `<p class="product-price">${money(product.price)}</p>`
                : ""
            }

            <button class="secondary-btn"
              onclick="toggleWishlist('${product.id}')">
              Remove ♥
            </button>
          </div>
        </article>
      `).join("")
    : '<p class="empty-message">Your wishlist is empty.</p>';
}

/* SHOPPING CART */

function addToCart(id) {
  const product = products.find(p => p.id === id);

  if (!product || product.stock <= 0) {
    alert("This product is currently unavailable.");
    return;
  }

  const existing = cart.find(item => item.id === id);

  if (existing) {
    if (existing.quantity >= product.stock) {
      alert("Not enough stock available.");
      return;
    }

    existing.quantity++;
  } else {
    cart.push({ id, quantity: 1 });
  }

  saveAll();
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveAll();
  renderCart();
}

function renderCart() {
  const area = document.getElementById("cartItems");
  const totalArea = document.getElementById("cartTotal");
  const countArea = document.getElementById("cartCount");

  const validCart = cart.filter(item =>
    products.some(p => p.id === item.id)
  );

  if (countArea) {
    countArea.textContent = validCart.reduce(
      (sum, item) => sum + item.quantity, 0
    );
  }

  if (!area || !totalArea) return;

  let total = 0;
  let hasUnpricedProduct = false;

  area.innerHTML = validCart.length
    ? validCart.map(item => {
        const product = products.find(p => p.id === item.id);

        const hasPrice =
          product.price !== null &&
          product.price !== undefined &&
          product.price !== "";

        let priceText = "Contact us for price";

        if (hasPrice) {
          const subtotal = Number(product.price) * item.quantity;
          total += subtotal;
          priceText = money(subtotal);
        } else {
          hasUnpricedProduct = true;
        }

        return `
          <div class="cart-row">
            <span>${escapeHTML(product.name)} × ${item.quantity}</span>
            <strong>${priceText}</strong>
            <button onclick="removeFromCart('${product.id}')">Remove</button>
          </div>
        `;
      }).join("")
    : '<p>Your shopping cart is empty.</p>';

  totalArea.textContent = hasUnpricedProduct
    ? "Total: Contact us for price"
    : "Total: " + money(total);
}

/* SEARCH */

function showSearch() {
  document.getElementById("products")?.scrollIntoView();
  document.getElementById("searchInput")?.focus();
}

/* CUSTOMER LOGIN PLACEHOLDER */

function customerLogin() {
  alert(
    "Customer accounts will be connected when we add the secure online database."
  );
}

/* OWNER LOGIN */

function adminLogin() {
  const pin = document.getElementById("adminPin").value;

  // Demo PIN only. This is not secure server-side authentication.
  if (pin === "1234") {
    sessionStorage.setItem("cheval_admin_logged_in", "yes");
    openAdmin();
  } else {
    document.getElementById("loginError").textContent =
      "Incorrect PIN. Please try again.";
  }
}

function openAdmin() {
  document.getElementById("loginPanel").hidden = true;
  document.getElementById("adminDashboard").hidden = false;
  renderAdmin();
}

function adminLogout() {
  sessionStorage.removeItem("cheval_admin_logged_in");
  location.reload();
}

/* ADD PRODUCT */

const productForm = document.getElementById("productForm");

if (productForm) {
  productForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const file = document.getElementById("productPhoto").files[0];

    if (!file || !file.type.startsWith("image/")) {
      alert("Please select a valid product photo.");
      return;
    }

    if (file.size > 1500000) {
      alert("Please use an image smaller than 1.5 MB.");
      return;
    }

    const name = document.getElementById("productName").value.trim();
    const category = document.getElementById("productCategory").value;
    const priceInput = document.getElementById("productPrice").value.trim();
    const stock = Number(document.getElementById("productStock").value);
    const description = document.getElementById("productDescription").value.trim();

    const price = priceInput === "" ? null : Number(priceInput);

    if (
      !name ||
      !category ||
      !Number.isInteger(stock) ||
      stock < 0 ||
      (price !== null && (!Number.isFinite(price) || price < 0))
    ) {
      alert("Please check the product information.");
      return;
    }

    const reader = new FileReader();

    reader.onload = function() {
      const product = {
        id: createId(),
        name,
        category,
        price,
        stock,
        sold: 0,
        description,
        photo: reader.result
      };

      products.push(product);

      saveAll();
      productForm.reset();

      alert("Product added successfully!");
      renderAdmin();
    };

    reader.onerror = () => alert("Could not read this photo.");
    reader.readAsDataURL(file);
  });
}

/* RECORD SALE */

const saleForm = document.getElementById("saleForm");

if (saleForm) {
  saleForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const id = document.getElementById("saleProduct").value;
    const quantity = Number(
      document.getElementById("saleQuantity").value
    );

    const priceInput = document.getElementById("salePrice").value.trim();
    const price = priceInput === "" ? null : Number(priceInput);

    const product = products.find(p => p.id === id);

    if (
      !product ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > product.stock ||
      (price !== null && (!Number.isFinite(price) || price < 0))
    ) {
      alert("Please check the product and quantity.");
      return;
    }

    // Reduce stock automatically.
    product.stock -= quantity;
    product.sold = Number(product.sold || 0) + quantity;

    sales.push({
      id: createId(),
      productId: product.id,
      productName: product.name,
      quantity,
      price,
      date: new Date().toISOString()
    });

    saveAll();
    saleForm.reset();

    document.getElementById("saleMessage").textContent =
      "Sale recorded successfully! Stock has been updated.";

    renderAdmin();
  });
}

/* ADD NEW STOCK */

function addStock(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  const amount = prompt(
    "How many new units have arrived for " + product.name + "?"
  );

  if (amount === null) return;

  const quantity = Number(amount);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    alert("Enter a valid whole number greater than zero.");
    return;
  }

  product.stock = Number(product.stock || 0) + quantity;

  saveAll();
  renderAdmin();

  alert(quantity + " units added to stock.");
}

/* INVENTORY TABLE AND DASHBOARD */

function renderAdmin() {
  if (!document.getElementById("adminDashboard")) return;

  const totalStock = products.reduce(
    (sum, p) => sum + Number(p.stock || 0), 0
  );

  const totalSold = products.reduce(
    (sum, p) => sum + Number(p.sold || 0), 0
  );

  const lowStock = products.filter(
    p => Number(p.stock || 0) <= 5
  ).length;

  document.getElementById("totalProducts").textContent = products.length;
  document.getElementById("totalStock").textContent = totalStock;
  document.getElementById("totalSold").textContent = totalSold;
  document.getElementById("lowStockProducts").textContent = lowStock;

  const table = document.getElementById("inventoryTable");

  table.innerHTML = products.map(p => {
    const hasPrice =
      p.price !== null &&
      p.price !== undefined &&
      p.price !== "";

    return `
      <tr>
        <td><img src="${p.photo}" alt=""></td>
        <td>${escapeHTML(p.name)}</td>
        <td>${hasPrice ? money(p.price) : "Not set"}</td>
        <td>${Number(p.stock || 0)}</td>
        <td>${Number(p.sold || 0)}</td>
        <td>
          <button class="action-btn"
            onclick="addStock('${p.id}')">Add Stock</button>

          <button class="action-btn"
            onclick="editProduct('${p.id}')">Edit</button>

          <button class="action-btn"
            onclick="deleteProduct('${p.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");

  if (!products.length) {
    table.innerHTML =
      '<tr><td colspan="6">No products added yet.</td></tr>';
  }

  const select = document.getElementById("saleProduct");

  select.innerHTML = products.length
    ? products.filter(p => p.stock > 0).map(p =>
        `<option value="${p.id}">${escapeHTML(p.name)} (${p.stock} available)</option>`
      ).join("")
    : '<option value="">Add products first</option>';

  if (!products.some(p => p.stock > 0)) {
    select.innerHTML = '<option value="">No products in stock</option>';
  }

  renderSalesReport();
}

/* EDIT AND DELETE */

function editProduct(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  const newName = prompt("Product name:", product.name);
  if (newName === null) return;

  const newPrice = prompt(
    "Selling price (leave empty for no price):",
    product.price ?? ""
  );
  if (newPrice === null) return;

  const newDescription = prompt(
    "Description (optional):",
    product.description || ""
  );
  if (newDescription === null) return;

  const price = newPrice.trim() === "" ? null : Number(newPrice);

  if (
    !newName.trim() ||
    (price !== null && (!Number.isFinite(price) || price < 0))
  ) {
    alert("Please enter valid information.");
    return;
  }

  product.name = newName.trim();
  product.price = price;
  product.description = newDescription.trim();

  saveAll();
  renderAdmin();
}

function deleteProduct(id) {
  if (!confirm("Are you sure you want to delete this product?")) return;

  products = products.filter(p => p.id !== id);
  cart = cart.filter(item => item.id !== id);
  wishlist = wishlist.filter(item => item !== id);

  saveAll();
  renderAdmin();
}

/* STOCK AND SALES REPORTS */

function renderSalesReport() {
  const period =
    document.getElementById("reportPeriod")?.value || "today";

  const now = new Date();

  const filtered = sales.filter(sale => {
    const date = new Date(sale.date);

    if (period === "today") {
      return date.toDateString() === now.toDateString();
    }

    if (period === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);

      return date >= start && date <= now;
    }

    if (period === "month") {
      return date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();
    }

    if (period === "year") {
      return date.getFullYear() === now.getFullYear();
    }

    return true;
  });

  const unitsSold = filtered.reduce(
    (sum, sale) => sum + Number(sale.quantity || 0), 0
  );

  document.getElementById("periodSales").textContent =
    "Units Sold: " + unitsSold;

  const productTotals = {};

  filtered.forEach(sale => {
    const name = sale.productName || "Unknown Product";

    productTotals[name] =
      (productTotals[name] || 0) + Number(sale.quantity || 0);
  });

  const report = document.getElementById("salesReport");

  report.innerHTML = Object.keys(productTotals).length
    ? `
      <h3>Products Sold</h3>
      ${Object.entries(productTotals).map(([name, quantity]) => `
        <p>
          <strong>${escapeHTML(name)}</strong>:
          ${quantity} units sold
        </p>
      `).join("")}
    `
    : "<p>No sales recorded for this period.</p>";
}

/* BACKUP AND RESTORE */

function downloadBackup() {
  const backup = {
    products,
    sales,
    date: new Date().toISOString()
  };

  const file = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = url;
  link.download = "CHEVAL-backup.json";
  link.click();

  URL.revokeObjectURL(url);
}

function restoreBackup() {
  const file = document.getElementById("restoreFile").files[0];

  if (!file) {
    alert("Please choose a backup file.");
    return;
  }

  const reader = new FileReader();

  reader.onload = function() {
    try {
      const backup = JSON.parse(reader.result);

      if (
        !Array.isArray(backup.products) ||
        !Array.isArray(backup.sales)
      ) {
        throw new Error("Invalid backup file.");
      }

      if (!confirm(
        "Restore this backup? Current products and sales will be replaced."
      )) {
        return;
      }

      products = backup.products;
      sales = backup.sales;
      cart = [];
      wishlist = [];

      saveAll();
      renderAdmin();

      alert("Backup restored successfully.");
    } catch (error) {
      alert("This backup file is invalid.");
    }
  };

  reader.readAsText(file);
}

/* STARTUP */

document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("year")?.replaceChildren(
    document.createTextNode(new Date().getFullYear())
  );

  // Apply the selected language on the customer page.
  if (document.getElementById("languageBtn")) {
    document.querySelectorAll("[data-en][data-am]").forEach(element => {
      element.textContent = element.dataset[language];
    });

    document.getElementById("languageBtn").textContent =
      language === "en" ? "EN | አማ" : "አማ | EN";

    renderProducts();
  }

  // Keep the admin dashboard hidden until the PIN is entered.
  if (document.getElementById("adminDashboard")) {
    if (sessionStorage.getItem("cheval_admin_logged_in") === "yes") {
      openAdmin();
    }
  }
});