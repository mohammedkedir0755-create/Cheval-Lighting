
"use strict";

/* =========================================================
   CHEVAL LIGHTING STORE
   Supabase cloud database connection
   ========================================================= */

const SUPABASE_URL = "https://zuvsognjxyzbcdjxhnpg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_AhjYKXSkqXvjb8C9pd3ARQ_Z2o_13mr";

if (!window.supabase) {
  alert("Supabase could not load. Check your internet connection and refresh.");
}

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const STORAGE_BUCKET = "product-images";

const CART_KEY = "cheval_cart_v1";
const WISH_KEY = "cheval_wishlist_v1";
const LANGUAGE_KEY = "cheval_language";

let products = [];
let sales = [];
let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
let wishlist = JSON.parse(localStorage.getItem(WISH_KEY) || "[]");

let currentCategory = "All";
let language = localStorage.getItem(LANGUAGE_KEY) || "en";
let currentUser = null;
let isOwner = false;
let customerAuthMode = "login";
let currentGalleryPhotos = [];
let currentGalleryIndex = 0;

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

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

function saveLocalPreferences() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  localStorage.setItem(WISH_KEY, JSON.stringify(wishlist));
}

function showMessage(id, message, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#ed1734" : "#20c878";
}

function setButtonLoading(button, loading, loadingText = "Please wait...") {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function getProductPhotos(product) {
  if (Array.isArray(product.photos)) {
    return product.photos.filter(
      photo => typeof photo === "string" && photo.length > 0
    );
  }

  if (product.photo) return [product.photo];

  return [];
}

/* Convert a database product into the format used by the website. */
function mapDatabaseProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price === null ? null : Number(row.price),
    stock: Number(row.stock || 0),
    sold: Number(row.sold || 0),
    description: row.description || "",
    photos: Array.isArray(row.photos) ? row.photos : []
  };
}

/* Convert a database sale into the format used by reports. */
function mapDatabaseSale(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity || 0),
    price: Number(row.price || 0),
    date: row.sold_at
  };
}

/* =========================================================
   LOAD CLOUD DATA
   ========================================================= */

async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  products = (data || []).map(mapDatabaseProduct);
  renderProducts();
}

async function loadSales() {
  if (!isOwner) {
    sales = [];
    return;
  }

  const { data, error } = await supabaseClient
    .from("sales")
    .select("*")
    .order("sold_at", { ascending: false });

  if (error) throw error;

  sales = (data || []).map(mapDatabaseSale);
}

async function loadCloudData() {
  try {
    await loadProducts();

    if (isOwner) {
      await loadSales();
      renderAdmin();
    }
  } catch (error) {
    console.error("Cloud data error:", error);

    const grid = document.getElementById("productGrid");

    if (grid) {
      grid.innerHTML =
        '<p class="empty-message">Could not load products. Please refresh the page.</p>';
    }

    showMessage(
      "productMessage",
      "Could not load cloud data: " + error.message,
      true
    );
  }
}

/* =========================================================
   PRODUCT PHOTOS - SUPABASE STORAGE
   ========================================================= */

async function uploadProductPhotos(files) {
  const uploadedUrls = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Please select image files only.");
    }

    if (file.size > 1500000) {
      throw new Error(
        "Each photo must be smaller than 1.5 MB."
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = createId() + "-" + safeName;

    const { error: uploadError } = await supabaseClient
      .storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabaseClient
      .storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
}

/* =========================================================
   LANGUAGE
   ========================================================= */

function toggleLanguage() {
  language = language === "en" ? "am" : "en";

  localStorage.setItem(LANGUAGE_KEY, language);

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

/* =========================================================
   CUSTOMER PRODUCT PHOTOS AND GALLERY
   ========================================================= */

function getProductPhotoHTML(product) {
  const photos = getProductPhotos(product);

  if (photos.length) {
    return `
      <button
        type="button"
        class="product-photo-button"
        onclick="openProductGallery('${escapeHTML(product.id)}')"
        aria-label="View photos of ${escapeHTML(product.name)}"
      >
        <img src="${escapeHTML(photos[0])}" alt="${escapeHTML(product.name)}">
        <span>View Photos (${photos.length})</span>
      </button>
    `;
  }

  return `
    <button
      type="button"
      class="product-photo-button no-product-photo"
      onclick="openProductGallery('${escapeHTML(product.id)}')"
    >
      <span>No photo available</span>
      <small>View product</small>
    </button>
  `;
}

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

  gallery.addEventListener("click", event => {
    if (event.target === gallery) closeProductGallery();
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
    main.innerHTML = '<div class="no-gallery-photo">No photos available yet.</div>';
    counter.textContent = "0 photos";
    thumbnails.innerHTML = "";
    return;
  }

  main.innerHTML = `
    <img
      src="${escapeHTML(currentGalleryPhotos[currentGalleryIndex])}"
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
      <img src="${escapeHTML(photo)}" alt="Product photo ${index + 1}">
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
  ) return;

  currentGalleryIndex = index;
  renderGalleryPhoto();
}

function closeProductGallery() {
  document.getElementById("productGallery")?.remove();
}

/* =========================================================
   CUSTOMER STORE - PRODUCTS AND CATEGORIES
   ========================================================= */

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
                  ? `<button onclick="addToCart('${escapeHTML(product.id)}')">Add to Cart</button>`
                  : `<button disabled>Unavailable</button>`
              }

              <button onclick="toggleWishlist('${escapeHTML(product.id)}')">
                ${wishlist.includes(product.id) ? "♥ Saved" : "♡ Wishlist"}
              </button>

              <button
                type="button"
                onclick="openProductGallery('${escapeHTML(product.id)}')"
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

  const categories = [
    "All",
    ...new Set(products.map(p => p.category).filter(Boolean))
  ];

  area.innerHTML = categories.map(category => `
    <button
      class="category-btn ${currentCategory === category ? "active" : ""}"
      onclick="selectCategory('${escapeHTML(category)}')"
    >
      ${escapeHTML(category)}
    </button>
  `).join("");
}

function selectCategory(category) {
  currentCategory = category;
  renderProducts();
}

/* =========================================================
   WISHLIST
   ========================================================= */

function toggleWishlist(id) {
  if (wishlist.includes(id)) {
    wishlist = wishlist.filter(item => item !== id);
  } else {
    wishlist.push(id);
  }

  saveLocalPreferences();
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
              product.price !== null && product.price !== undefined
                ? `<p class="product-price">${money(product.price)}</p>`
                : `<p class="contact-price">Contact us for price</p>`
            }

            <button
              class="secondary-btn"
              onclick="toggleWishlist('${escapeHTML(product.id)}')"
            >
              Remove ♥
            </button>
          </div>
        </article>
      `).join("")
    : '<p class="empty-message">Your wishlist is empty.</p>';
}

/* =========================================================
   SHOPPING CART
   ========================================================= */

function addToCart(id) {
  const product = products.find(p => p.id === id);

  if (!product || Number(product.stock) <= 0) {
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

  saveLocalPreferences();
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveLocalPreferences();
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
      (sum, item) => sum + Number(item.quantity || 0), 0
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
            <button onclick="removeFromCart('${escapeHTML(product.id)}')">
              Remove
            </button>
          </div>
        `;
      }).join("")
    : "<p>Your shopping cart is empty.</p>";

  totalArea.textContent = hasUnpricedProduct
    ? "Total: Contact us for price"
    : "Total: " + money(total);
}

/* =========================================================
   SEARCH
   ========================================================= */

function showSearch() {
  document.getElementById("products")?.scrollIntoView();
  document.getElementById("searchInput")?.focus();
}

/* =========================================================
   CUSTOMER ACCOUNT - SUPABASE AUTHENTICATION
   ========================================================= */

function customerLogin() {
  if (currentUser) {
    const account = document.getElementById("customerAccount");

    if (account) {
      account.classList.remove("hidden");
      return;
    }
  }

  const overlay = document.getElementById("authOverlay");

  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.style.display = "flex";
  }
}

function closeCustomerLogin() {
  const overlay = document.getElementById("authOverlay");

  if (overlay) {
    overlay.classList.add("hidden");
    overlay.style.display = "none";
  }

  showMessage("authMessage", "");
}

function switchCustomerAuth() {
  customerAuthMode =
    customerAuthMode === "login" ? "signup" : "login";

  const title = document.getElementById("authTitle");
  const description = document.getElementById("authDescription");
  const submit = document.getElementById("authSubmitButton");
  const switchButton = document.getElementById("authSwitchButton");

  if (customerAuthMode === "signup") {
    if (title) title.textContent = "Create Customer Account";
    if (description) description.textContent = "Create an account to use CHEVAL Lighting.";
    if (submit) submit.textContent = "Create Account";
    if (switchButton) switchButton.textContent = "Already have an account? Login";
  } else {
    if (title) title.textContent = "Customer Login";
    if (description) description.textContent = "Sign in to your CHEVAL account.";
    if (submit) submit.textContent = "Login";
    if (switchButton) switchButton.textContent = "Create a new account";
  }

  showMessage("authMessage", "");
}

async function customerLogout() {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert("Could not log out: " + error.message);
    return;
  }

  currentUser = null;
  updateCustomerAccountUI();
  closeCustomerLogin();
}

function updateCustomerAccountUI() {
  const loginButton = document.getElementById("customerLoginButton");
  const account = document.getElementById("customerAccount");
  const email = document.getElementById("customerEmail");

  if (currentUser) {
    if (loginButton) loginButton.classList.add("hidden");
    if (account) account.classList.remove("hidden");
    if (email) email.textContent = currentUser.email || "";
  } else {
    if (loginButton) loginButton.classList.remove("hidden");
    if (account) account.classList.add("hidden");
  }
}

async function handleCustomerAuth(event) {
  event.preventDefault();

  if (!supabaseClient) {
    showMessage("authMessage", "Database connection is unavailable.", true);
    return;
  }

  const email = document.getElementById("customerAuthEmail")?.value.trim();
  const password = document.getElementById("customerAuthPassword")?.value;
  const button = document.getElementById("authSubmitButton");

  if (!email || !password) {
    showMessage("authMessage", "Enter your email and password.", true);
    return;
  }

  setButtonLoading(button, true);

  try {
    if (customerAuthMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) throw error;

      if (data.session) {
        currentUser = data.user;
        updateCustomerAccountUI();
        closeCustomerLogin();
        alert("Your customer account has been created successfully.");
      } else {
        showMessage(
          "authMessage",
          "Account created. Check your email to confirm your account."
        );
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      currentUser = data.user;
      updateCustomerAccountUI();
      closeCustomerLogin();
      alert("You are now logged in.");
    }
  } catch (error) {
    showMessage("authMessage", error.message, true);
  } finally {
    setButtonLoading(button, false);
  }
}

/* =========================================================
   OWNER LOGIN - OWNER ROLE CHECK
   ========================================================= */

async function verifyOwner(user) {
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Owner role check:", error);
    return false;
  }

  return data?.role === "owner";
}

async function showOwnerDashboard(user) {
  currentUser = user;
  isOwner = true;

  const loginPanel = document.getElementById("loginPanel");
  const dashboard = document.getElementById("dashboard");
  const logoutButton = document.getElementById("adminLogoutButton");
  const ownerEmail = document.getElementById("ownerEmailDisplay");

  if (loginPanel) loginPanel.classList.add("hidden");
  if (dashboard) dashboard.classList.remove("hidden");
  if (logoutButton) logoutButton.classList.remove("hidden");
  if (ownerEmail) ownerEmail.textContent = user.email || "";

  try {
    await loadCloudData();
  } catch (error) {
    showMessage("productMessage", error.message, true);
  }
}

async function handleOwnerLogin(event) {
  event.preventDefault();

  const email = document.getElementById("adminEmail")?.value.trim();
  const password = document.getElementById("adminPassword")?.value;
  const button = document.getElementById("adminLoginButton");

  const errorArea = document.getElementById("loginError");

  if (!email || !password) {
    if (errorArea) errorArea.textContent = "Enter your email and password.";
    return;
  }

  setButtonLoading(button, true, "Signing in...");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const ownerIsValid = await verifyOwner(data.user);

    if (!ownerIsValid) {
      await supabaseClient.auth.signOut();
      throw new Error("This account does not have owner permission.");
    }

    if (errorArea) errorArea.textContent = "";

    await showOwnerDashboard(data.user);
  } catch (error) {
    if (errorArea) errorArea.textContent = error.message;
  } finally {
    setButtonLoading(button, false);
  }
}

async function adminLogout() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert("Could not log out: " + error.message);
    return;
  }

  currentUser = null;
  isOwner = false;
  location.reload();
}

/* =========================================================
   CHANGE OWNER PASSWORD
   ========================================================= */

async function handlePasswordChange(event) {
  event.preventDefault();

  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword.length < 8) {
    showMessage(
      "passwordMessage",
      "Password must contain at least 8 characters.",
      true
    );
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage("passwordMessage", "Passwords do not match.", true);
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({
    password: newPassword
  });

  if (error) {
    showMessage("passwordMessage", error.message, true);
    return;
  }

  document.getElementById("changePasswordForm").reset();

  showMessage(
    "passwordMessage",
    "Your owner password has been updated successfully."
  );
}

/* =========================================================
   ADD PRODUCT
   ========================================================= */

async function handleAddProduct(event) {
  event.preventDefault();

  const name = document.getElementById("productName").value.trim();
  const category = document.getElementById("productCategory").value;
  const priceInput = document.getElementById("productPrice").value.trim();
  const stock = Number(document.getElementById("productStock").value);
  const description =
    document.getElementById("productDescription").value.trim();

  const files = Array.from(
    document.getElementById("productPhoto").files
  );

  const price = priceInput === "" ? null : Number(priceInput);

  if (
    !name ||
    !category ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    (price !== null && (!Number.isFinite(price) || price < 0))
  ) {
    showMessage("productMessage", "Please check all product information.", true);
    return;
  }

  const button = document.getElementById("addProductButton");
  setButtonLoading(button, true, "Saving product...");

  try {
    const photos = files.length
      ? await uploadProductPhotos(files)
      : [];

    const { data, error } = await supabaseClient
      .from("products")
      .insert([{
        name,
        category,
        price,
        stock,
        sold: 0,
        description,
        photos
      }])
      .select()
      .single();

    if (error) throw error;

    products.unshift(mapDatabaseProduct(data));

    document.getElementById("productForm").reset();

    renderAdmin();
    renderProducts();

    showMessage("productMessage", "Product added successfully!");
  } catch (error) {
    console.error(error);
    showMessage("productMessage", error.message, true);
  } finally {
    setButtonLoading(button, false);
  }
}

/* =========================================================
   ADD MORE PHOTOS TO A PRODUCT
   ========================================================= */

async function addProductPhotos(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/webp";
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
      const newPhotos = await uploadProductPhotos(files);
      const updatedPhotos = [...getProductPhotos(product), ...newPhotos];

      const { error } = await supabaseClient
        .from("products")
        .update({ photos: updatedPhotos })
        .eq("id", id);

      if (error) throw error;

      product.photos = updatedPhotos;

      renderAdmin();
      renderProducts();

      alert("New product photos added successfully!");
    } catch (error) {
      alert("Could not add photos: " + error.message);
    }

    fileInput.remove();
  });

  fileInput.click();
}

/* =========================================================
   RECORD A SALE
   ========================================================= */

async function handleRecordSale(event) {
  event.preventDefault();

  const id = document.getElementById("saleProduct").value;
  const quantity = Number(document.getElementById("saleQuantity").value);
  const priceInput = document.getElementById("salePrice").value.trim();

  const product = products.find(p => p.id === id);

  const price = priceInput === ""
    ? Number(product?.price)
    : Number(priceInput);

  if (
    !product ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > product.stock ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    showMessage(
      "saleMessage",
      "Check the product, quantity and sale price. The product must have a price.",
      true
    );
    return;
  }

  const button = document.getElementById("recordSaleButton");
  setButtonLoading(button, true, "Recording sale...");

  try {
    const newStock = Number(product.stock) - quantity;
    const newSold = Number(product.sold || 0) + quantity;

    const { error: productError } = await supabaseClient
      .from("products")
      .update({
        stock: newStock,
        sold: newSold
      })
      .eq("id", id);

    if (productError) throw productError;

    const { data: saleData, error: saleError } = await supabaseClient
      .from("sales")
      .insert([{
        product_id: product.id,
        product_name: product.name,
        quantity,
        price,
        sold_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (saleError) {
      /* Try to return the stock if the sale could not be saved. */
      await supabaseClient
        .from("products")
        .update({
          stock: Number(product.stock),
          sold: Number(product.sold || 0)
        })
        .eq("id", id);

      throw saleError;
    }

    product.stock = newStock;
    product.sold = newSold;
    sales.unshift(mapDatabaseSale(saleData));

    document.getElementById("saleForm").reset();

    renderAdmin();
    renderProducts();

    showMessage("saleMessage", "Sale recorded successfully!");
  } catch (error) {
    showMessage("saleMessage", error.message, true);
  } finally {
    setButtonLoading(button, false);
  }
}

/* =========================================================
   ADD STOCK
   ========================================================= */

async function addStock(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  const amount = prompt(
    "How many new units have arrived for " + product.name + "?"
  );

  if (amount === null) return;

  const quantity = Number(amount);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    alert("Enter a whole number greater than zero.");
    return;
  }

  const newStock = Number(product.stock || 0) + quantity;

  const { error } = await supabaseClient
    .from("products")
    .update({ stock: newStock })
    .eq("id", id);

  if (error) {
    alert("Could not update stock: " + error.message);
    return;
  }

  product.stock = newStock;

  renderAdmin();
  renderProducts();

  alert(quantity + " units added to stock.");
}

/* =========================================================
   EDIT PRODUCT
   ========================================================= */

async function editProduct(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  const newName = prompt("Product name:", product.name);
  if (newName === null) return;

  const newCategory = prompt("Category:", product.category);
  if (newCategory === null) return;

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
    !newCategory.trim() ||
    (price !== null && (!Number.isFinite(price) || price < 0))
  ) {
    alert("Please enter valid product information.");
    return;
  }

  const changes = {
    name: newName.trim(),
    category: newCategory.trim(),
    price,
    description: newDescription.trim()
  };

  const { error } = await supabaseClient
    .from("products")
    .update(changes)
    .eq("id", id);

  if (error) {
    alert("Could not update product: " + error.message);
    return;
  }

  Object.assign(product, changes);

  renderAdmin();
  renderProducts();

  alert("Product updated successfully.");
}

/* =========================================================
   DELETE PRODUCT
   ========================================================= */

async function deleteProduct(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  if (!confirm("Delete " + product.name + "?")) return;

  const { error } = await supabaseClient
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Could not delete product: " + error.message);
    return;
  }

  products = products.filter(p => p.id !== id);
  cart = cart.filter(item => item.id !== id);
  wishlist = wishlist.filter(item => item !== id);

  saveLocalPreferences();

  renderAdmin();
  renderProducts();
}

/* =========================================================
   ADMIN DASHBOARD AND INVENTORY
   ========================================================= */

function renderAdmin() {
  const dashboard = document.getElementById("dashboard");
  if (!dashboard || !isOwner) return;

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

  if (table) {
    table.innerHTML = products.map(p => {
      const photoCount = getProductPhotos(p).length;

      return `
        <tr>
          <td>${escapeHTML(p.name)}</td>
          <td>${escapeHTML(p.category)}</td>
          <td>${p.price === null ? "Not set" : money(p.price)}</td>
          <td>${Number(p.stock || 0)}</td>
          <td>${Number(p.sold || 0)}</td>
          <td>
            <button type="button"
              onclick="addProductPhotos('${escapeHTML(p.id)}')">
              Add Photos
            </button>

            <span class="photo-count">${photoCount} photo(s)</span>

            <button type="button"
              onclick="addStock('${escapeHTML(p.id)}')">
              Add Stock
            </button>

            <button type="button"
              onclick="editProduct('${escapeHTML(p.id)}')">
              Edit
            </button>

            <button type="button"
              class="danger"
              onclick="deleteProduct('${escapeHTML(p.id)}')">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join("");

    if (!products.length) {
      table.innerHTML =
        '<tr><td colspan="6">No products added yet.</td></tr>';
    }
  }

  const select = document.getElementById("saleProduct");

  if (select) {
    const availableProducts = products.filter(p => Number(p.stock) > 0);

    select.innerHTML = availableProducts.length
      ? '<option value="">Choose product</option>' +
        availableProducts.map(p => `
          <option value="${escapeHTML(p.id)}">
            ${escapeHTML(p.name)} (${Number(p.stock)} available)
          </option>
        `).join("")
      : '<option value="">No products in stock</option>';
  }

  renderSalesReport();
}

/* =========================================================
   SALES REPORT DATE FILTERS
   ========================================================= */

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

/* =========================================================
   DELETE SALES FOR A PRODUCT IN SELECTED PERIOD
   ========================================================= */

async function deleteProductSales(productKey) {
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
    (sum, sale) => sum + Number(sale.quantity || 0), 0
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

  const saleIds = selectedSales.map(sale => sale.id);

  try {
    if (product) {
      const newStock = Number(product.stock || 0) + quantityToRestore;
      const newSold = Math.max(
        0,
        Number(product.sold || 0) - quantityToRestore
      );

      const { error: stockError } = await supabaseClient
        .from("products")
        .update({ stock: newStock, sold: newSold })
        .eq("id", product.id);

      if (stockError) throw stockError;

      product.stock = newStock;
      product.sold = newSold;
    }

    const { error: deleteError } = await supabaseClient
      .from("sales")
      .delete()
      .in("id", saleIds);

    if (deleteError) throw deleteError;

    sales = sales.filter(sale => !saleIds.includes(sale.id));

    renderAdmin();
    renderProducts();

    alert("The selected sales records have been deleted.");
  } catch (error) {
    alert("Could not delete sales: " + error.message);
    await loadCloudData();
  }
}

/* =========================================================
   DISPLAY SALES REPORT
   ========================================================= */

function renderSalesReport() {
  const period =
    document.getElementById("reportPeriod")?.value || "today";

  const filtered = sales.filter(sale =>
    saleMatchesPeriod(sale, period)
  );

  const totalRevenue = filtered.reduce(
    (sum, sale) =>
      sum + Number(sale.quantity || 0) * Number(sale.price || 0),
    0
  );

  const periodSales = document.getElementById("periodSales");

  if (periodSales) {
    periodSales.textContent = money(totalRevenue);
  }

  const productTotals = new Map();

  filtered.forEach(sale => {
    const key = getSaleProductKey(sale);
    const name = sale.productName || "Unknown Product";

    if (!productTotals.has(key)) {
      productTotals.set(key, {
        name,
        quantity: 0,
        revenue: 0
      });
    }

    const item = productTotals.get(key);

    item.quantity += Number(sale.quantity || 0);
    item.revenue +=
      Number(sale.quantity || 0) * Number(sale.price || 0);
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
      <div
        class="sold-product-row"
        style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin:12px 0; padding:12px; border-bottom:1px solid #ccc;"
      >
        <div>
          <strong>${escapeHTML(item.name)}</strong>
          <p style="margin:5px 0;">
            ${item.quantity} units sold
          </p>
          <p style="margin:5px 0;">
            Sales: ${money(item.revenue)}
          </p>
        </div>

        <button
          type="button"
          class="danger delete-sale-btn"
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

/* =========================================================
   DOWNLOAD BACKUP
   ========================================================= */

function downloadBackup() {
  const backup = {
    products,
    sales,
    date: new Date().toISOString(),
    store: "CHEVAL Lighting Store"
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

/* =========================================================
   RESTORE BACKUP TO SUPABASE
   ========================================================= */

async function restoreBackup() {
  const file = document.getElementById("restoreFile")?.files[0];

  if (!file) {
    showMessage("backupMessage", "Please choose a backup file.", true);
    return;
  }

  try {
    const backup = JSON.parse(await file.text());

    if (
      !Array.isArray(backup.products) ||
      !Array.isArray(backup.sales)
    ) {
      throw new Error("This backup file is not valid.");
    }

    if (!confirm(
      "Restore this backup? Current cloud products and sales will be replaced."
    )) return;

    showMessage("backupMessage", "Restoring backup...");

    /* Delete sales first because they refer to products. */
    const { error: salesDeleteError } = await supabaseClient
      .from("sales")
      .delete()
      .not("id", "is", null);

    if (salesDeleteError) throw salesDeleteError;

    const { error: productsDeleteError } = await supabaseClient
      .from("products")
      .delete()
      .not("id", "is", null);

    if (productsDeleteError) throw productsDeleteError;

    const idMap = new Map();
    const productRows = [];

    for (const product of backup.products) {
      const newId = createId();
      idMap.set(String(product.id), newId);

      productRows.push({
        id: newId,
        name: product.name,
        category: product.category,
        price: product.price === "" ? null : product.price,
        stock: Number(product.stock || 0),
        sold: Number(product.sold || 0),
        description: product.description || "",
        photos: getProductPhotos(product)
      });
    }

    if (productRows.length) {
      const { error } = await supabaseClient
        .from("products")
        .insert(productRows);

      if (error) throw error;
    }

    const saleRows = backup.sales.map(sale => ({
      product_id: sale.productId
        ? (idMap.get(String(sale.productId)) || null)
        : null,
      product_name: sale.productName || "Unknown Product",
      quantity: Number(sale.quantity || 0),
      price: Number(sale.price || 0),
      sold_at: sale.date || new Date().toISOString()
    }));

    if (saleRows.length) {
      const { error } = await supabaseClient
        .from("sales")
        .insert(saleRows);

      if (error) throw error;
    }

    await loadCloudData();

    showMessage("backupMessage", "Backup restored successfully!");
  } catch (error) {
    console.error(error);
    showMessage("backupMessage", error.message, true);
  }
}

/* =========================================================
   CONNECT BUTTONS AND FORMS
   ========================================================= */

function connectPageEvents() {
  const ownerLoginForm = document.getElementById("ownerLoginForm");

  if (ownerLoginForm) {
    ownerLoginForm.addEventListener("submit", handleOwnerLogin);
  }

  const customerAuthForm = document.getElementById("customerAuthForm");

  if (customerAuthForm) {
    customerAuthForm.addEventListener("submit", handleCustomerAuth);
  }

  const productForm = document.getElementById("productForm");

  if (productForm) {
    productForm.addEventListener("submit", handleAddProduct);
  }

  const saleForm = document.getElementById("saleForm");

  if (saleForm) {
    saleForm.addEventListener("submit", handleRecordSale);
  }

  const changePasswordForm =
    document.getElementById("changePasswordForm");

  if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", handlePasswordChange);
  }

  document.getElementById("reportPeriod")?.addEventListener(
    "change",
    renderSalesReport
  );

  document.getElementById("downloadBackupButton")?.addEventListener(
    "click",
    downloadBackup
  );

  document.getElementById("restoreBackupButton")?.addEventListener(
    "click",
    restoreBackup
  );

  document.getElementById("authSwitchButton")?.addEventListener(
    "click",
    switchCustomerAuth
  );
}

/* =========================================================
   STARTUP AND SESSION CHECK
   ========================================================= */

async function startWebsite() {
  document.getElementById("year")?.replaceChildren(
    document.createTextNode(new Date().getFullYear())
  );

  if (document.getElementById("languageBtn")) {
    document.querySelectorAll("[data-en][data-am]").forEach(element => {
      element.textContent = element.dataset[language];
    });

    document.getElementById("languageBtn").textContent =
      language === "en" ? "EN | አማ" : "አማ | EN";
  }

  connectPageEvents();

  if (!supabaseClient) return;

  /* Restore the current login session, if one exists. */
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Session error:", error);
  }

  const user = data?.session?.user || null;

  if (user) {
    currentUser = user;
  }

  updateCustomerAccountUI();

  /* If this is the owner dashboard page, verify owner permission. */
  if (document.getElementById("dashboard")) {
    if (user) {
      const ownerIsValid = await verifyOwner(user);

      if (ownerIsValid) {
        await showOwnerDashboard(user);
      } else {
        await supabaseClient.auth.signOut();
        currentUser = null;
        isOwner = false;
      }
    }

    return;
  }

  /* On the public store page, load products for everyone. */
  await loadCloudData();

  /* Keep the account display updated when a customer signs in or out. */
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateCustomerAccountUI();
  });
}

document.addEventListener("DOMContentLoaded", startWebsite);
