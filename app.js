"use strict";

/* STORAGE */

const PRODUCTS_KEY = "cheval_products_v1";
const SALES_KEY = "cheval_sales_v1";
const CART_KEY = "cheval_cart_v1";
const WISH_KEY = "cheval_wishlist_v1";
const ADMIN_PIN_KEY = "cheval_admin_pin_v1";

let products = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "[]");
let sales = JSON.parse(localStorage.getItem(SALES_KEY) || "[]");
let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
let wishlist = JSON.parse(localStorage.getItem(WISH_KEY) || "[]");

let currentCategory = "All";
let language = localStorage.getItem("cheval_language") || "en";
let adminPin = localStorage.getItem(ADMIN_PIN_KEY) || "1315";

/* SAVE DATA */

function saveAll() {
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
    localStorage.setItem(SALES_KEY, JSON.stringify(sales));
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    localStorage.setItem(WISH_KEY, JSON.stringify(wishlist));
    return true;
  } catch (error) {
    alert(
      "Your browser storage is full. Try using smaller photos or fewer photos."
    );
    return false;
  }
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US") + " ETB";
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

/* PRODUCT PHOTO HELPERS */

/* Supports both new multiple-photo products and older single-photo products. */
function getProductPhotos(product) {
  if (Array.isArray(product.photos)) {
    return product.photos.filter(
      photo => typeof photo === "string" && photo.length > 0
    );
  }

  if (product.photo) {
    return [product.photo];
  }

  return [];
}

function getProductPhotoHTML(product) {
  const photos = getProductPhotos(product);

  if (photos.length) {
    return `
      <button
        type="button"
        class="product-photo-button"
        onclick="openProductGallery('${product.id}')"
        aria-label="View photos of ${escapeHTML(product.name)}"
      >
        <img src="${photos[0]}" alt="${escapeHTML(product.name)}">
        <span>View Photos (${photos.length})</span>
      </button>
    `;
  }

  return `
    <button
      type="button"
      class="product-photo-button no-product-photo"
      onclick="openProductGallery('${product.id}')"
    >
      <span>No photo available</span>
      <small>View product</small>
    </button>
  `;
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please select image files only."));
      return;
    }

    if (file.size > 1500000) {
      reject(new Error(
        "Each photo must be smaller than 1.5 MB. Please reduce the photo size."
      ));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read a photo."));

    reader.readAsDataURL(file);
  });
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

          ${getProductPhotoHTML(product)}

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
                : `<p class="contact-price">Contact us for price</p>`
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

              <button
                type="button"
                onclick="openProductGallery('${product.id}')"
              >
                View Photos
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

/* PRODUCT PHOTO GALLERY */

let currentGalleryPhotos = [];
let currentGalleryIndex = 0;

function openProductGallery(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  currentGalleryPhotos = getProductPhotos(product);
  currentGalleryIndex = 0;

  closeProductGallery();

  const gallery = document.createElement("div");
  gallery.id = "productGallery";
  gallery.className = "gallery-overlay";

  gallery.innerHTML = `
    <div class="gallery-window">

      <button
        type="button"
        class="gallery-close"
        onclick="closeProductGallery()"
        aria-label="Close gallery"
      >×</button>

      <h2>${escapeHTML(product.name)}</h2>

      <div id="galleryMainImage"></div>

      <div class="gallery-controls">
        <button type="button" onclick="changeGalleryPhoto(-1)">
          ❮ Previous
        </button>

        <span id="galleryCounter"></span>

        <button type="button" onclick="changeGalleryPhoto(1)">
          Next ❯
        </button>
      </div>

      <div id="galleryThumbnails" class="gallery-thumbnails"></div>
    </div>
  `;

  gallery.addEventListener("click", function(event) {
    if (event.target === gallery) {
      closeProductGallery();
    }
  });

  document.body.appendChild(gallery);
  renderGalleryPhoto();
}

function renderGalleryPhoto() {
  const main = document.getElementById("galleryMainImage");
  const counter = document.getElementById("galleryCounter");
  const thumbnails = document.getElementById("galleryThumbnails");

  if (!main || !counter || !thumbnails) return;

  if (!currentGalleryPhotos.length) {
    main.innerHTML = `
      <div class="no-gallery-photo">
        No photos available yet.
      </div>
    `;

    counter.textContent = "0 photos";
    thumbnails.innerHTML = "";
    return;
  }

  main.innerHTML = `
    <img
      src="${currentGalleryPhotos[currentGalleryIndex]}"
      alt="Product photo"
    >
  `;

  counter.textContent =
    (currentGalleryIndex + 1) + " / " + currentGalleryPhotos.length;

  thumbnails.innerHTML = currentGalleryPhotos.map((photo, index) => `
    <button
      type="button"
      class="gallery-thumb ${index === currentGalleryIndex ? "active" : ""}"
      onclick="selectGalleryPhoto(${index})"
      aria-label="Show photo ${index + 1}"
    >
      <img src="${photo}" alt="Product photo ${index + 1}">
    </button>
  `).join("");
}

function changeGalleryPhoto(direction) {
  if (!currentGalleryPhotos.length) return;

  currentGalleryIndex =
    (currentGalleryIndex + direction + currentGalleryPhotos.length) %
    currentGalleryPhotos.length;

  renderGalleryPhoto();
}

function selectGalleryPhoto(index) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= currentGalleryPhotos.length
  ) {
    return;
  }

  currentGalleryIndex = index;
  renderGalleryPhoto();
}

function closeProductGallery() {
  document.getElementById("productGallery")?.remove();
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

          ${getProductPhotoHTML(product)}

          <div class="product-info">
            <h3>${escapeHTML(product.name)}</h3>

            ${
              product.price !== null &&
              product.price !== undefined &&
              product.price !== ""
                ? `<p class="product-price">${money(product.price)}</p>`
                : `<p class="contact-price">Contact us for price</p>`
            }

            <button
              class="secondary-btn"
              onclick="toggleWishlist('${product.id}')"
            >
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
  const pinInput = document.getElementById("adminPin");
  const error = document.getElementById("loginError");

  const pin = pinInput.value;

  adminPin = localStorage.getItem(ADMIN_PIN_KEY) || "1315";

  if (pin === adminPin) {
    sessionStorage.setItem("cheval_admin_logged_in", "yes");
    openAdmin();
    error.textContent = "";
  } else {
    error.textContent = "Incorrect PIN. Please try again.";
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

/* CHANGE OWNER PASSWORD */

const changePasswordForm = document.getElementById("changePasswordForm");

if (changePasswordForm) {
  changePasswordForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const currentPassword =
      document.getElementById("currentPassword").value;

    const newPassword =
      document.getElementById("newPassword").value;

    const confirmPassword =
      document.getElementById("confirmPassword").value;

    adminPin = localStorage.getItem(ADMIN_PIN_KEY) || "1315";

    if (currentPassword !== adminPin) {
      alert("Your current password is incorrect.");
      return;
    }

    if (newPassword.length < 4) {
      alert("Your new password must contain at least 4 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("The new passwords do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      alert("Your new password must be different from the current password.");
      return;
    }

    localStorage.setItem(ADMIN_PIN_KEY, newPassword);
    adminPin = newPassword;

    changePasswordForm.reset();

    alert("Your owner password has been changed successfully!");
  });
}

/* ADD PRODUCT WITH MULTIPLE PHOTOS */

const productForm = document.getElementById("productForm");

if (productForm) {
  productForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const files = Array.from(
      document.getElementById("productPhoto").files
    );

    const name = document.getElementById("productName").value.trim();
    const category = document.getElementById("productCategory").value;
    const priceInput = document.getElementById("productPrice").value.trim();
    const stock = Number(document.getElementById("productStock").value);
    const description =
      document.getElementById("productDescription").value.trim();

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

    try {
      const photos = await Promise.all(files.map(readImageFile));

      const product = {
        id: createId(),
        name,
        category,
        price,
        stock,
        sold: 0,
        description,
        photos,
        photo: photos[0] || ""
      };

      products.push(product);

      if (!saveAll()) {
        products.pop();
        return;
      }

      productForm.reset();

      alert("Product added successfully!");

      renderAdmin();
      renderProducts();

    } catch (error) {
      alert(error.message || "Could not save the product photos.");
    }
  });
}

/* ADD MORE PHOTOS TO AN EXISTING PRODUCT */

function addProductPhotos(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  const fileInput = document.createElement("input");

  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  fileInput.style.display = "none";

  document.body.appendChild(fileInput);

  fileInput.addEventListener("change", async function() {
    const files = Array.from(fileInput.files);

    if (!files.length) {
      fileInput.remove();
      return;
    }

    try {
      const newPhotos = await Promise.all(files.map(readImageFile));

      const oldPhotos = getProductPhotos(product);

      product.photos = [...oldPhotos, ...newPhotos];
      product.photo = product.photos[0] || "";

      if (!saveAll()) {
        product.photos = oldPhotos;
        product.photo = oldPhotos[0] || "";
        fileInput.remove();
        return;
      }

      renderAdmin();
      renderProducts();

      alert("New product photos added successfully!");

    } catch (error) {
      alert(error.message || "Could not add the photos.");
    }

    fileInput.remove();
  });

  fileInput.click();
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

    const photoCount = getProductPhotos(p).length;

    return `
      <tr>
        <td>${getProductPhotoHTML(p)}</td>

        <td>${escapeHTML(p.name)}</td>

        <td>${hasPrice ? money(p.price) : "Not set"}</td>

        <td>${Number(p.stock || 0)}</td>

        <td>${Number(p.sold || 0)}</td>

        <td>
          <button
            class="action-btn"
            onclick="addProductPhotos('${p.id}')"
          >
            Add Photos
          </button>

          <span class="photo-count">${photoCount} photo(s)</span>

          <button
            class="action-btn"
            onclick="addStock('${p.id}')"
          >Add Stock</button>

          <button
            class="action-btn"
            onclick="editProduct('${p.id}')"
          >Edit</button>

          <button
            class="action-btn"
            onclick="deleteProduct('${p.id}')"
          >Delete</button>
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

/* EDIT AND DELETE PRODUCTS */

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
  renderProducts();
}

function deleteProduct(id) {
  if (!confirm("Are you sure you want to delete this product?")) return;

  products = products.filter(p => p.id !== id);
  cart = cart.filter(item => item.id !== id);
  wishlist = wishlist.filter(item => item !== id);

  saveAll();
  renderAdmin();
  renderProducts();
}

/* STOCK AND SALES REPORTS */

function saleMatchesPeriod(sale, period) {
  const date = new Date(sale.date);

  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();

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
}

function getSaleProductKey(sale) {
  return sale.productId
    ? String(sale.productId)
    : "legacy:" + String(sale.productName || "Unknown Product");
}

function deleteProductSales(productKey) {
  const period =
    document.getElementById("reportPeriod")?.value || "today";

  const selectedSales = sales.filter(sale =>
    getSaleProductKey(sale) === productKey &&
    saleMatchesPeriod(sale, period)
  );

  if (!selectedSales.length) {
    alert("No sales records found for this product in this period.");
    return;
  }

  const quantityToRestore = selectedSales.reduce(
    (sum, sale) => sum + Number(sale.quantity || 0),
    0
  );

  const product = products.find(p => String(p.id) === productKey);

  const productName = product?.name ||
    selectedSales[0].productName ||
    "this product";

  const periodName = {
    today: "today",
    week: "this week",
    month: "this month",
    year: "this year",
    all: "all time"
  }[period] || period;

  const message =
    "Delete " + quantityToRestore + " sold unit(s) of " +
    productName + " from " + periodName + "?\n\n" +
    "This will remove the matching sales records." +
    (product
      ? "\nThe " + quantityToRestore + " unit(s) will be returned to stock."
      : "\nThis product is no longer in inventory, so no stock will be restored.");

  if (!confirm(message)) return;

  const idsToDelete = new Set(
    selectedSales.map(sale => sale.id)
  );

  sales = sales.filter(sale => !idsToDelete.has(sale.id));

  if (product) {
    product.stock = Number(product.stock || 0) + quantityToRestore;

    product.sold = Math.max(
      0,
      Number(product.sold || 0) - quantityToRestore
    );
  }

  saveAll();
  renderAdmin();

  alert("The selected product's sales records have been deleted.");
}

function renderSalesReport() {
  const period =
    document.getElementById("reportPeriod")?.value || "today";

  const filtered = sales.filter(sale =>
    saleMatchesPeriod(sale, period)
  );

  const unitsSold = filtered.reduce(
    (sum, sale) => sum + Number(sale.quantity || 0), 0
  );

  const periodSales = document.getElementById("periodSales");

  if (periodSales) {
    periodSales.textContent = "Units Sold: " + unitsSold;
  }

  const productTotals = new Map();

  filtered.forEach(sale => {
    const key = getSaleProductKey(sale);
    const name = sale.productName || "Unknown Product";

    if (!productTotals.has(key)) {
      productTotals.set(key, {
        name,
        quantity: 0
      });
    }

    productTotals.get(key).quantity += Number(sale.quantity || 0);
  });

  const report = document.getElementById("salesReport");
  if (!report) return;

  if (!productTotals.size) {
    report.innerHTML = "<p>No sales recorded for this period.</p>";
    return;
  }

  report.innerHTML = `
    <h3>Products Sold</h3>

    ${Array.from(productTotals.entries()).map(([key, item]) => `
      <div class="sold-product-row"
        style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin:12px 0; padding:12px; border-bottom:1px solid #ccc;">

        <p style="margin:0;">
          <strong>${escapeHTML(item.name)}</strong>:
          ${item.quantity} units sold
        </p>

        <button
          type="button"
          class="action-btn delete-sale-btn"
          data-sale-key="${escapeHTML(key)}"
        >
          Delete
        </button>
      </div>
    `).join("")}
  `;

  report.querySelectorAll(".delete-sale-btn").forEach(button => {
    button.addEventListener("click", function() {
      deleteProductSales(button.dataset.saleKey);
    });
  });
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

      if (!saveAll()) return;

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

  if (document.getElementById("languageBtn")) {
    document.querySelectorAll("[data-en][data-am]").forEach(element => {
      element.textContent = element.dataset[language];
    });

    document.getElementById("languageBtn").textContent =
      language === "en" ? "EN | አማ" : "አማ | EN";

    renderProducts();
  }

  if (document.getElementById("adminDashboard")) {
    if (sessionStorage.getItem("cheval_admin_logged_in") === "yes") {
      openAdmin();
    }
  }
});
