// ─────────────────────────────────────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────────────────────────────────────
const authPanel = document.querySelector("#authPanel");
const authMessage = document.querySelector("#authMessage");
const otpRequestForm = document.querySelector("#otpRequestForm");
const otpVerifyForm = document.querySelector("#otpVerifyForm");
const sendOtpButton = document.querySelector("#sendOtpButton");
const verifyOtpButton = document.querySelector("#verifyOtpButton");
const backToEmailButton = document.querySelector("#backToEmailButton");
const resendOtpButton = document.querySelector("#resendOtpButton");
const resendCountdown = document.querySelector("#resendCountdown");
const authEmail = document.querySelector("#authEmail");
const authOtp = document.querySelector("#authOtp");
const onboardingPanel = document.querySelector("#onboardingPanel");
const onboardingForm = document.querySelector("#onboardingForm");
const onboardingName = document.querySelector("#onboardingName");
const onboardingAge = document.querySelector("#onboardingAge");
const onboardingGender = document.querySelector("#onboardingGender");
const onboardingSubmitButton = document.querySelector("#onboardingSubmitButton");
const onboardingMessage = document.querySelector("#onboardingMessage");
const workspace = document.querySelector("#workspace");
const workspaceTitle = document.querySelector("#workspaceTitle");
const workspaceMessage = document.querySelector("#workspaceMessage");
const sessionActions = document.querySelector("#sessionActions");
const closetSelect = document.querySelector("#closetSelect");
const manualResetButton = document.querySelector("#manualResetButton");
const statsGrid = document.querySelector("#statsGrid");
const vibeTitle = document.querySelector("#vibeTitle");
const vibeBadge = document.querySelector("#vibeBadge");
const vibeCopy = document.querySelector("#vibeCopy");
const vibeTags = document.querySelector("#vibeTags");
const funMeterValue = document.querySelector("#funMeterValue");
const funMeterCopy = document.querySelector("#funMeterCopy");
const meterFill = document.querySelector("#meterFill");
const itemForm = document.querySelector("#itemForm");
const outfitForm = document.querySelector("#outfitForm");
const joinForm = document.querySelector("#joinForm");
const aiPlannerForm = document.querySelector("#aiPlannerForm");
const shareCodeValue = document.querySelector("#shareCodeValue");
const copyShareCodeButton = document.querySelector("#copyShareCodeButton");
const memberList = document.querySelector("#memberList");
const aiResultCard = document.querySelector("#aiResultCard");
const reminderCard = document.querySelector("#reminderCard");
const enableNotificationsButton = document.querySelector("#enableNotificationsButton");
const tryOnForm = document.querySelector("#tryOnForm");
const profilePhotoInput = document.querySelector("#profilePhotoInput");
const tryOnItemSelect = document.querySelector("#tryOnItemSelect");
const overlayScaleInput = document.querySelector("#overlayScaleInput");
const overlayOffsetInput = document.querySelector("#overlayOffsetInput");
const tryOnAvatar = document.querySelector("#tryOnAvatar");
const tryOnAvatarPlaceholder = document.querySelector("#tryOnAvatarPlaceholder");
const tryOnGarment = document.querySelector("#tryOnGarment");
const tryOnNote = document.querySelector("#tryOnNote");
const clothesGrid = document.querySelector("#clothesGrid");
const closetEmpty = document.querySelector("#closetEmpty");
const historyList = document.querySelector("#historyList");
const historyEmpty = document.querySelector("#historyEmpty");
const filterRow = document.querySelector("#filterRow");
const searchInput = document.querySelector("#searchInput");
const dayPill = document.querySelector("#dayPill");

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE CLIENT
// ─────────────────────────────────────────────────────────────────────────────
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// APP STATE  (replaces localStorage state — populated from Supabase)
// ─────────────────────────────────────────────────────────────────────────────
let currentUser = null;       // { id, name, email, profileImage }
let selectedClosetId = null;
let closets = [];             // normalized closet objects
let membersCache = {};        // userId → { id, name, email, profileImage }

// UI-only state
let activeFilter = "all";
let notificationSentForClosetId = "";
let latestAiSuggestion = null;
let latestAiClosetId = "";
let lastTryOnClosetId = "";
let workspaceMessageTimer = null;

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function makeShareCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function mostRecentSundayKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return todayKey(d);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function formatDate(dateString) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI STYLING LOGIC  (pure client-side, no backend needed)
// ─────────────────────────────────────────────────────────────────────────────
function getOccasionMood(occasionText) {
  const text = occasionText.toLowerCase();
  if (/(office|meeting|work|formal|client)/.test(text)) return "smart";
  if (/(date|dinner|party|night|partner)/.test(text)) return "dressy";
  if (/(airport|travel|flight|trip)/.test(text)) return "comfort";
  if (/(gym|run|sport|walk)/.test(text)) return "active";
  return "casual";
}

function scoreItem(item, mood) {
  const text = `${item.name} ${item.notes} ${item.color}`.toLowerCase();
  let score = 10;
  if (item.status !== "available") return -999;
  if (!item.lastWornOn) score += 6;
  const wornDaysAgo = item.lastWornOn
    ? Math.abs((new Date(todayKey()) - new Date(item.lastWornOn)) / (1000 * 60 * 60 * 24))
    : 10;
  score += Math.min(wornDaysAgo, 7);
  if (mood === "smart" && /(oxford|shirt|trouser|loafer|watch|linen)/.test(text)) score += 8;
  if (mood === "dressy" && /(black|brown|linen|overshirt|loafer|watch|jacket)/.test(text)) score += 8;
  if (mood === "comfort" && /(tee|soft|oversized|easy|relaxed|sneaker)/.test(text)) score += 8;
  if (mood === "active" && /(gym|run|sport|trainer|shoe)/.test(text)) score += 8;
  if (mood === "casual" && /(tee|shirt|trouser|overshirt|watch)/.test(text)) score += 5;
  if (/(black|white|olive|brown|navy|grey|gray|beige)/.test(text)) score += 3;
  return score;
}

function chooseBestItem(items, type, mood, usedIds = new Set()) {
  return (
    items
      .filter((item) => item.type === type || (type === "Extra" && (item.type === "Layer" || item.type === "Accessory")))
      .filter((item) => !usedIds.has(item.id))
      .sort((a, b) => scoreItem(b, mood) - scoreItem(a, mood))[0] || null
  );
}

function buildAiSuggestion(closet, occasion) {
  const mood = getOccasionMood(occasion);
  const available = closet.items.filter((item) => item.status === "available");
  const usedIds = new Set();
  const top = chooseBestItem(available, "Top", mood, usedIds);
  if (top) usedIds.add(top.id);
  const bottom = chooseBestItem(available, "Bottom", mood, usedIds);
  if (bottom) usedIds.add(bottom.id);
  const shoes = chooseBestItem(available, "Shoes", mood, usedIds);
  if (shoes) usedIds.add(shoes.id);
  const extra = chooseBestItem(available, "Extra", mood, usedIds);
  const picks = [top, bottom, shoes, extra].filter(Boolean);
  if (!picks.length) return null;
  const reasonMap = {
    smart: "Built for a sharper, pulled-together look.",
    dressy: "Leans a bit more polished for a date or evening plan.",
    comfort: "Keeps the outfit easy and comfortable for moving around.",
    active: "Keeps things practical and light.",
    casual: "A balanced everyday outfit from what is ready to wear.",
  };
  return { mood, picks: { top, bottom, shoes, extra }, summary: picks.map((i) => i.name).join(", "), reason: reasonMap[mood] };
}

function applySuggestionToOutfitForm(suggestion, occasion) {
  outfitForm.elements.occasion.value = occasion;
  outfitForm.elements.topId.value = suggestion.picks.top?.id || "";
  outfitForm.elements.bottomId.value = suggestion.picks.bottom?.id || "";
  outfitForm.elements.shoesId.value = suggestion.picks.shoes?.id || "";
  outfitForm.elements.extraId.value = suggestion.picks.extra?.id || "";
  outfitForm.elements.comment.value = `AI stylist suggestion for ${occasion}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA ACCESS HELPERS  (read from in-memory cache)
// ─────────────────────────────────────────────────────────────────────────────
function getCurrentUser() { return currentUser; }
function getUserById(userId) { return membersCache[userId] || null; }
function getAccessibleClosets() { return closets; }
function getSelectedCloset() {
  if (!closets.length) return null;
  return closets.find((c) => c.id === selectedClosetId) || closets[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA NORMALIZATION  (Supabase snake_case → app camelCase)
// ─────────────────────────────────────────────────────────────────────────────
function normalizeItem(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    notes: row.notes || "",
    image: row.image_url || "",
    status: row.status,
    lastWornOn: row.last_worn_on || "",
  };
}

function normalizeOutfit(row) {
  return {
    id: row.id,
    occasion: row.occasion,
    comment: row.comment || "",
    itemIds: row.item_ids || [],
    chosenByUserId: row.chosen_by_user_id,
    createdAt: row.created_at,
  };
}

function normalizeCloset(row, memberRows, itemRows, outfitRows) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    shareCode: row.share_code,
    lastLaundryReset: row.last_laundry_reset,
    memberIds: (memberRows || []).map((m) => m.user_id),
    items: (itemRows || []).map(normalizeItem),
    outfitHistory: (outfitRows || []).map(normalizeOutfit),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADING  (fetches everything from Supabase into local cache)
// ─────────────────────────────────────────────────────────────────────────────
async function loadUserData() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    currentUser = null;
    closets = [];
    membersCache = {};
    return;
  }

  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  currentUser = {
    id: user.id,
    name: profile?.name || "",
    email: user.email,
    profileImage: profile?.profile_image_url || "",
  };

  const { data: memberships } = await db
    .from("closet_members")
    .select("closet_id")
    .eq("user_id", user.id);

  if (!memberships?.length) {
    closets = [];
    membersCache = { [user.id]: currentUser };
    return;
  }

  const closetIds = memberships.map((m) => m.closet_id);
  const { data: closetRows } = await db
    .from("closets")
    .select("*")
    .in("id", closetIds);

  const newMembersCache = { [user.id]: currentUser };

  const normalized = await Promise.all(
    (closetRows || []).map(async (closet) => {
      const [{ data: memberRows }, { data: itemRows }, { data: outfitRows }] = await Promise.all([
        db
          .from("closet_members")
          .select("user_id, profiles(id, name, email, profile_image_url)")
          .eq("closet_id", closet.id),
        db
          .from("items")
          .select("*")
          .eq("closet_id", closet.id)
          .order("created_at", { ascending: false }),
        db
          .from("outfits")
          .select("*")
          .eq("closet_id", closet.id)
          .order("created_at", { ascending: false }),
      ]);

      (memberRows || []).forEach((m) => {
        if (m.profiles) {
          newMembersCache[m.user_id] = {
            id: m.user_id,
            name: m.profiles.name,
            email: m.profiles.email,
            profileImage: m.profiles.profile_image_url,
          };
        }
      });

      return normalizeCloset(closet, memberRows, itemRows, outfitRows);
    })
  );

  closets = normalized;
  membersCache = newMembersCache;

  if (!selectedClosetId || !closets.find((c) => c.id === selectedClosetId)) {
    selectedClosetId = closets[0]?.id || null;
  }

  await ensureWeeklyReset();
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY RESET
// ─────────────────────────────────────────────────────────────────────────────
async function ensureWeeklyReset() {
  const currentSunday = mostRecentSundayKey();
  for (const closet of closets) {
    if (closet.lastLaundryReset === currentSunday) continue;
    await Promise.all([
      db.from("closets").update({ last_laundry_reset: currentSunday }).eq("id", closet.id),
      db.from("items").update({ status: "available" }).eq("closet_id", closet.id),
    ]);
    // Patch local state so UI reflects reset immediately without a second fetch
    closet.lastLaundryReset = currentSunday;
    closet.items.forEach((item) => { item.status = "available"; });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH  (OTP — no passwords)
// ─────────────────────────────────────────────────────────────────────────────
let pendingOtpEmail = "";
let resendTimer = null;

async function sendOtp(email) {
  const res = await fetch("/.netlify/functions/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) { setMessage(json.error || "Could not send code. Try again.", "error"); return false; }
  pendingOtpEmail = email;
  return true;
}

async function verifyOtp(otp) {
  // Backend verifies the 6-digit OTP and returns a ready session (access + refresh token).
  // Session is established server-side — no token is passed to the browser for verification.
  const res = await fetch("/.netlify/functions/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: pendingOtpEmail, otp }),
  });
  const json = await res.json();
  if (!res.ok) { setMessage(json.error || "Invalid code. Try again.", "error"); return; }

  // Set the Supabase session directly — bypasses verifyOtp token format issues entirely
  const { error } = await db.auth.setSession({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
  });
  if (error) { setMessage(error.message, "error"); return; }

  setMessage("");
  showOtpStep(false);

  if (json.isNewUser) {
    authPanel.classList.add("hidden");
    onboardingPanel.classList.remove("hidden");
    return;
  }

  pendingOtpEmail = "";
  await loadUserData();
  renderApp();
}

async function handleOnboardingSubmit(event) {
  event.preventDefault();
  const name = onboardingName.value.trim();
  const age = parseInt(onboardingAge.value, 10);
  const gender = onboardingGender.value;

  onboardingSubmitButton.disabled = true;
  onboardingSubmitButton.textContent = "Creating wardrobe...";
  onboardingMessage.textContent = "";

  // User is already authenticated from verifyOtp — just get their ID
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) {
    onboardingPanel.classList.add("hidden");
    authPanel.classList.remove("hidden");
    setMessage("Session expired. Please request a new code.", "error");
    onboardingSubmitButton.disabled = false;
    onboardingSubmitButton.textContent = "Create my wardrobe";
    return;
  }

  await db.from("profiles").insert({
    id: user.id,
    name,
    email: user.email,
    age,
    gender,
  });

  const { data: closet } = await db.from("closets").insert({
    owner_id: user.id,
    name: `${name}'s Wardrobe`,
    share_code: makeShareCode(),
    last_laundry_reset: mostRecentSundayKey(),
  }).select().single();

  if (closet) {
    await db.from("closet_members").insert({ closet_id: closet.id, user_id: user.id });
  }

  pendingOtpEmail = "";
  onboardingPanel.classList.add("hidden");
  onboardingForm.reset();
  onboardingSubmitButton.disabled = false;
  onboardingSubmitButton.textContent = "Create my wardrobe";

  await loadUserData();
  renderApp();
}

function startResendCountdown() {
  resendOtpButton.disabled = true;
  let seconds = 10;
  resendCountdown.textContent = seconds;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    seconds -= 1;
    if (resendCountdown) resendCountdown.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(resendTimer);
      resendOtpButton.disabled = false;
      resendOtpButton.textContent = "Resend code";
    }
  }, 1000);
}

function showOtpStep(show) {
  otpRequestForm.classList.toggle("hidden", show);
  otpVerifyForm.classList.toggle("hidden", !show);
  if (show) {
    startResendCountdown();
    authOtp.focus();
  } else {
    authOtp.value = "";
    clearInterval(resendTimer);
    resendOtpButton.disabled = true;
    resendOtpButton.innerHTML = `Resend code in <span id="resendCountdown">10</span>s`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function setMessage(message, type = "") {
  authMessage.textContent = message;
  authMessage.className = `auth-message${type ? ` ${type}` : ""}`;
}

function setWorkspaceMessage(message, type = "") {
  workspaceMessage.textContent = message;
  workspaceMessage.className = `workspace-message${type ? ` ${type}` : ""}`;
  clearTimeout(workspaceMessageTimer);
  if (message && type === "success") {
    workspaceMessageTimer = setTimeout(() => {
      workspaceMessage.textContent = "";
      workspaceMessage.className = "workspace-message";
    }, 4000);
  }
}

function summarizeReset() {
  dayPill.textContent = `Last laundry cycle reset: ${formatDate(mostRecentSundayKey())}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────
async function toggleItemStatus(closetId, itemId) {
  const closet = closets.find((c) => c.id === closetId);
  const item = closet?.items.find((i) => i.id === itemId);
  if (!item) return;
  const newStatus = item.status === "available" ? "worn" : "available";
  await db.from("items").update({
    status: newStatus,
    last_worn_on: newStatus === "worn" ? todayKey() : (item.lastWornOn || null),
  }).eq("id", itemId);
  await loadUserData();
  renderApp();
}

async function deleteItem(closetId, itemId, itemName) {
  if (!confirm(`Remove "${itemName}" from your wardrobe?`)) return;
  await db.from("items").delete().eq("id", itemId);
  setWorkspaceMessage("Item removed from your wardrobe.", "success");
  await loadUserData();
  renderApp();
}

async function handleManualReset() {
  const closet = getSelectedCloset();
  if (!closet) return;
  await Promise.all([
    db.from("closets").update({ last_laundry_reset: mostRecentSundayKey() }).eq("id", closet.id),
    db.from("items").update({ status: "available" }).eq("closet_id", closet.id),
  ]);
  setWorkspaceMessage("All clothes were moved back to available.", "success");
  await loadUserData();
  renderApp();
}

async function handleItemSubmit(event) {
  event.preventDefault();
  const closet = getSelectedCloset();
  if (!closet) return;

  const formData = new FormData(itemForm);
  const file = formData.get("image");
  let imageUrl = "";

  if (file instanceof File && file.size) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `items/${crypto.randomUUID()}.${ext}`;
    const { data: upload } = await db.storage.from("wardrobe").upload(path, file);
    if (upload) {
      const { data: { publicUrl } } = db.storage.from("wardrobe").getPublicUrl(upload.path);
      imageUrl = publicUrl;
    }
  }

  await db.from("items").insert({
    closet_id: closet.id,
    name: String(formData.get("name")).trim(),
    type: formData.get("type"),
    color: String(formData.get("color")).trim(),
    notes: String(formData.get("notes")).trim(),
    image_url: imageUrl,
  });

  itemForm.reset();
  setWorkspaceMessage("Clothing item added to your wardrobe.", "success");
  await loadUserData();
  renderApp();
}

async function handleProfilePhotoUpload() {
  if (!currentUser) return;
  const file = profilePhotoInput.files?.[0];
  if (!file) return;

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `profiles/${currentUser.id}.${ext}`;
  const { data: upload } = await db.storage.from("wardrobe").upload(path, file, { upsert: true });
  if (!upload) return;

  const { data: { publicUrl } } = db.storage.from("wardrobe").getPublicUrl(upload.path);
  await db.from("profiles").update({ profile_image_url: publicUrl }).eq("id", currentUser.id);
  setWorkspaceMessage("Your photo was added for try-on preview.", "success");
  await loadUserData();
  renderApp();
}

async function handleOutfitSubmit(event) {
  event.preventDefault();
  const closet = getSelectedCloset();
  if (!closet || !currentUser) return;

  const formData = new FormData(outfitForm);
  const itemIds = ["topId", "bottomId", "shoesId", "extraId"]
    .map((field) => formData.get(field))
    .filter(Boolean);

  if (!itemIds.length) {
    setWorkspaceMessage("Select at least one clothing item before saving the outfit.", "error");
    return;
  }

  await Promise.all([
    db.from("outfits").insert({
      closet_id: closet.id,
      occasion: String(formData.get("occasion")).trim(),
      comment: String(formData.get("comment")).trim(),
      chosen_by_user_id: currentUser.id,
      item_ids: itemIds,
    }),
    db.from("items").update({ status: "worn", last_worn_on: todayKey() }).in("id", itemIds),
  ]);

  outfitForm.reset();
  setWorkspaceMessage("Outfit saved and selected clothes moved to worn.", "success");
  await loadUserData();
  renderApp();
}

async function handleJoin(event) {
  event.preventDefault();
  if (!currentUser) return;
  const formData = new FormData(joinForm);
  const code = String(formData.get("shareCode")).trim().toUpperCase();

  const { data: closet } = await db
    .from("closets")
    .select("*")
    .eq("share_code", code)
    .single();

  if (!closet) {
    setWorkspaceMessage("That share code was not found.", "error");
    return;
  }

  if (closets.some((c) => c.id === closet.id)) {
    setWorkspaceMessage("You already have access to that wardrobe.", "success");
    return;
  }

  await db.from("closet_members").insert({ closet_id: closet.id, user_id: currentUser.id });
  selectedClosetId = closet.id;
  joinForm.reset();
  setWorkspaceMessage("Shared wardrobe joined successfully.", "success");
  await loadUserData();
  renderApp();
}

function handleAiPlanner(event) {
  event.preventDefault();
  const closet = getSelectedCloset();
  if (!closet) return;
  const occasion = String(new FormData(aiPlannerForm).get("occasion")).trim();
  const suggestion = buildAiSuggestion(closet, occasion);

  if (!suggestion) {
    renderAiSuggestionContent(null);
    setWorkspaceMessage("The AI stylist needs more available clothes to suggest an outfit.", "error");
    return;
  }

  latestAiClosetId = closet.id;
  applySuggestionToOutfitForm(suggestion, occasion);
  renderAiSuggestionContent(suggestion);
  renderFunStrip(closet);
  setWorkspaceMessage("AI stylist suggested an outfit and filled the planner form.", "success");
}

function handleTryOnControls() {
  const closet = getSelectedCloset();
  if (!closet || !currentUser) return;
  renderTryOnStage(closet, currentUser);
}

async function handleEnableNotifications() {
  if (!("Notification" in window)) {
    setWorkspaceMessage("This browser does not support notifications.", "error");
    return;
  }
  const permission = await Notification.requestPermission();
  renderWorkspace();
  if (permission === "granted") {
    setWorkspaceMessage("Browser notifications enabled for wash reminders.", "success");
    const closet = getSelectedCloset();
    if (closet) maybeNotifyLaundry(closet);
    return;
  }
  setWorkspaceMessage("Notifications were not enabled.", "error");
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
function renderSession() {
  const user = getCurrentUser();
  sessionActions.innerHTML = "";
  if (!user) return;

  const userLabel = document.createElement("span");
  userLabel.className = "session-user";
  userLabel.textContent = user.name;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost-button";
  button.textContent = "Logout";
  button.addEventListener("click", async () => {
    await db.auth.signOut();
    currentUser = null;
    closets = [];
    membersCache = {};
    selectedClosetId = null;
    renderApp();
  });

  sessionActions.append(userLabel, button);
}

function renderClosetOptions() {
  const accessible = getAccessibleClosets();
  closetSelect.innerHTML = "";
  accessible.forEach((closet) => {
    const option = document.createElement("option");
    option.value = closet.id;
    option.textContent = closet.name;
    closetSelect.append(option);
  });
  const selected = getSelectedCloset();
  if (selected) {
    closetSelect.value = selected.id;
    selectedClosetId = selected.id;
  }
}

function getFilteredItems(closet) {
  const search = searchInput.value.trim().toLowerCase();
  return closet.items.filter((item) => {
    const matchesFilter = activeFilter === "all" || item.status === activeFilter;
    const matchesSearch =
      !search ||
      [item.name, item.type, item.color, item.notes].join(" ").toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });
}

function buildPlaceholderCard(item) {
  const hue = item.type.length * 42;
  return `linear-gradient(145deg, hsla(${hue}, 62%, 74%, 0.9), hsla(${hue + 40}, 40%, 86%, 0.95))`;
}

function buildTryOnPlaceholder(item) {
  const hue = item.type.length * 46;
  return `linear-gradient(180deg, hsla(${hue}, 58%, 82%, 0.9), hsla(${hue + 24}, 32%, 66%, 0.95))`;
}

function renderAiSuggestionContent(suggestion) {
  if (suggestion) latestAiSuggestion = suggestion;
  if (!suggestion) {
    aiResultCard.innerHTML = `<strong>No AI suggestion yet.</strong><p>Add more available clothes so the stylist has something to work with.</p>`;
    return;
  }
  const lines = [
    suggestion.picks.top ? `Top: ${suggestion.picks.top.name}` : "",
    suggestion.picks.bottom ? `Bottom: ${suggestion.picks.bottom.name}` : "",
    suggestion.picks.shoes ? `Shoes: ${suggestion.picks.shoes.name}` : "",
    suggestion.picks.extra ? `Extra: ${suggestion.picks.extra.name}` : "",
  ].filter(Boolean);
  aiResultCard.innerHTML = `
    <strong>${escapeHtml(suggestion.summary)}</strong>
    <p>${escapeHtml(suggestion.reason)} ${escapeHtml(lines.join(" | "))}</p>
  `;
}

function renderFunStrip(closet) {
  const available = closet.items.filter((i) => i.status === "available").length;
  const worn = closet.items.filter((i) => i.status === "worn").length;
  const total = closet.items.length || 1;
  const shareCount = closet.memberIds.length;
  const outfitCount = closet.outfitHistory.length;
  const recentOccasion = closet.outfitHistory[0]?.occasion || "";
  const aiMood = latestAiSuggestion?.mood || "";

  let title = "Fresh closet energy";
  let badge = "BALANCED";
  let copy = "You have a nice mix of ready-to-wear pieces and room to play with outfits.";

  if (worn >= Math.max(3, Math.ceil(total * 0.45))) {
    title = "Laundry day drama"; badge = "WASH MODE";
    copy = "A good chunk of the closet is in the worn pile. One reset and you are back in business.";
  } else if (outfitCount >= 5) {
    title = "Main character wardrobe"; badge = "HOT STREAK";
    copy = "You have been planning looks consistently. This closet has momentum.";
  } else if (shareCount > 1) {
    title = "Couple stylist mode"; badge = "CO-OP";
    copy = "This wardrobe has shared taste in the room. Expect stronger opinions and better outfits.";
  }

  const tags = [
    `${available} ready now`,
    `${worn} in worn pile`,
    `${outfitCount} looks logged`,
    shareCount > 1 ? `${shareCount} stylists inside` : "solo styling",
    recentOccasion ? `last plan: ${recentOccasion}` : "first look pending",
    aiMood ? `AI mood: ${aiMood}` : "AI ready",
  ];

  vibeTitle.textContent = title;
  vibeBadge.textContent = badge;
  vibeCopy.textContent = copy;
  vibeTags.innerHTML = "";
  tags.forEach((tagText) => {
    const tag = document.createElement("span");
    tag.className = "vibe-tag";
    tag.textContent = tagText;
    vibeTags.append(tag);
  });

  const funMeter = Math.min(100, 28 + outfitCount * 8 + shareCount * 10 + Math.round((available / total) * 30));
  funMeterValue.textContent = `${funMeter}%`;
  funMeterCopy.textContent =
    funMeter >= 80
      ? "This closet is lively, collaborative, and fully in its groove."
      : funMeter >= 55
        ? "The wardrobe has good rhythm. A few more outfit plans and it really pops."
        : "You have the base. Add a few more looks and the vibe meter will climb fast.";
  meterFill.style.width = `${funMeter}%`;
}

function maybeNotifyLaundry(closet) {
  const wornItems = closet.items.filter((i) => i.status === "worn");
  if (wornItems.length < 3) { notificationSentForClosetId = ""; return; }
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted" && notificationSentForClosetId !== closet.id) {
    notificationSentForClosetId = closet.id;
    new Notification("Tryunex laundry reminder", {
      body: `You have ${wornItems.length} clothes in the worn pile. It may be wash time.`,
    });
  }
}

function renderReminder(closet) {
  const wornItems = closet.items.filter((i) => i.status === "worn").length;
  const permission = "Notification" in window ? Notification.permission : "unsupported";

  if (permission === "unsupported") {
    reminderCard.innerHTML = `<strong>Browser alerts are not supported here.</strong><p>You can still use the in-app reminder and the Sunday reset.</p>`;
    enableNotificationsButton.disabled = true;
    return;
  }

  enableNotificationsButton.disabled = permission === "granted";
  enableNotificationsButton.textContent = permission === "granted" ? "Browser alerts enabled" : "Enable browser alerts";

  if (wornItems >= 3) {
    reminderCard.innerHTML = `<strong>Wash reminder: ${wornItems} items are in the worn pile.</strong><p>Your closet is starting to stack up. Sunday reset will move them back automatically.</p>`;
  } else if (wornItems > 0) {
    reminderCard.innerHTML = `<strong>${wornItems} item${wornItems === 1 ? "" : "s"} waiting for wash.</strong><p>You are still fine, but the reminder will get stronger as more clothes move to worn.</p>`;
  } else {
    reminderCard.innerHTML = `<strong>Closet is fresh right now.</strong><p>No clothes are sitting in the worn pile.</p>`;
  }

  maybeNotifyLaundry(closet);
}

function renderTryOnOptions(closet) {
  const previous = tryOnItemSelect.value;
  tryOnItemSelect.innerHTML = '<option value="">Choose clothing item</option>';
  closet.items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name} · ${item.type}`;
    tryOnItemSelect.append(option);
  });
  tryOnItemSelect.value = closet.items.some((i) => i.id === previous) ? previous : "";
}

function renderTryOnStage(closet, user) {
  const profileImage = user?.profileImage || "";
  const selectedItem = closet.items.find((i) => i.id === tryOnItemSelect.value) || null;
  const scale = Number(overlayScaleInput.value || 100) / 100;
  const offset = Number(overlayOffsetInput.value || 0);

  if (profileImage) {
    tryOnAvatar.src = profileImage;
    tryOnAvatar.classList.remove("hidden");
    tryOnAvatarPlaceholder.classList.add("hidden");
  } else {
    tryOnAvatar.removeAttribute("src");
    tryOnAvatar.classList.add("hidden");
    tryOnAvatarPlaceholder.classList.remove("hidden");
  }

  if (selectedItem) {
    tryOnGarment.style.backgroundImage = selectedItem.image
      ? `url(${selectedItem.image})`
      : buildTryOnPlaceholder(selectedItem);
    tryOnGarment.classList.remove("hidden");
    tryOnGarment.style.transform = `translateX(-50%) translateY(${offset}px) scale(${scale})`;
    tryOnNote.textContent = profileImage
      ? `Previewing ${selectedItem.name} on your uploaded photo. Use the sliders to nudge the dress placement.`
      : `Select your photo as well to preview ${selectedItem.name} on yourself.`;
  } else {
    tryOnGarment.classList.add("hidden");
    tryOnGarment.style.backgroundImage = "none";
    tryOnGarment.style.transform = "translateX(-50%) scale(1)";
    tryOnNote.textContent = "This is a quick style preview. A real AI virtual try-on would need a stronger image model and backend.";
  }
}

function renderClothes(closet) {
  const items = getFilteredItems(closet);
  clothesGrid.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "item-card";

    const image = document.createElement(item.image ? "img" : "div");
    image.className = "item-image";
    if (item.image) { image.src = item.image; image.alt = item.name; }
    else { image.style.background = buildPlaceholderCard(item); }

    const body = document.createElement("div");
    body.className = "item-body";

    const topline = document.createElement("div");
    topline.className = "item-topline";
    topline.innerHTML = `
      <span class="tag">${escapeHtml(item.type)}</span>
      <span class="status-pill ${item.status}">${item.status}</span>
    `;

    const name = document.createElement("strong");
    name.className = "item-name";
    name.textContent = item.name;

    const notes = document.createElement("p");
    notes.className = "item-notes";
    notes.textContent = item.notes || `${item.color} ${item.type.toLowerCase()}`;

    const footer = document.createElement("div");
    footer.className = "item-footer";

    const meta = document.createElement("span");
    meta.textContent = item.lastWornOn ? `Last worn ${formatDate(item.lastWornOn)}` : `${item.color} and ready`;

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "secondary-button";
    toggleButton.textContent = item.status === "available" ? "Mark worn" : "Return to closet";
    toggleButton.addEventListener("click", () => toggleItemStatus(closet.id, item.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "Remove";
    deleteButton.addEventListener("click", () => deleteItem(closet.id, item.id, item.name));

    footer.append(meta, toggleButton, deleteButton);
    body.append(topline, name, notes, footer);
    card.append(image, body);
    clothesGrid.append(card);
  });
  closetEmpty.classList.toggle("hidden", items.length !== 0);
}

function renderMembers(closet) {
  memberList.innerHTML = "";
  closet.memberIds
    .map((memberId) => getUserById(memberId))
    .filter(Boolean)
    .forEach((member) => {
      const badge = document.createElement("div");
      badge.className = "member-badge";
      badge.innerHTML = `
        <div>
          <strong>${escapeHtml(member.name)}</strong>
          <small>${escapeHtml(member.email)}</small>
        </div>
        <span class="tag">${member.id === closet.ownerId ? "Owner" : "Member"}</span>
      `;
      memberList.append(badge);
    });
}

function renderStats(closet) {
  const available = closet.items.filter((i) => i.status === "available").length;
  const worn = closet.items.filter((i) => i.status === "worn").length;
  statsGrid.innerHTML = "";
  [
    { value: available, label: "Ready to wear" },
    { value: worn, label: "In worn pile" },
    { value: closet.outfitHistory.length, label: "Outfits planned" },
    { value: closet.memberIds.length, label: "Closet members" },
  ].forEach((card) => {
    const el = document.createElement("article");
    el.className = "stats-card";
    el.innerHTML = `<strong>${card.value}</strong><span>${card.label}</span>`;
    statsGrid.append(el);
  });
}

function renderHistory(closet) {
  historyList.innerHTML = "";
  const history = [...closet.outfitHistory].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  history.forEach((entry) => {
    const itemNames = entry.itemIds
      .map((itemId) => closet.items.find((i) => i.id === itemId))
      .filter(Boolean)
      .map((i) => i.name);
    const chooser = getUserById(entry.chosenByUserId);
    const block = document.createElement("article");
    block.className = "history-entry";
    const commentPart = entry.comment ? `. ${escapeHtml(entry.comment)}` : "";
    block.innerHTML = `
      <div class="history-topline">
        <strong>${escapeHtml(entry.occasion)}</strong>
        <span class="tag">${escapeHtml(chooser ? chooser.name : "Member")}</span>
      </div>
      <p>${escapeHtml(itemNames.join(", ")) || "No items listed"}${commentPart}</p>
      <div class="history-meta">
        <span>${formatDate(entry.createdAt)}</span>
        <span>${itemNames.length} item${itemNames.length === 1 ? "" : "s"}</span>
      </div>
    `;
    historyList.append(block);
  });
  historyEmpty.classList.toggle("hidden", history.length !== 0);
}

function renderPlannerOptions(closet) {
  [["topId", "Top"], ["bottomId", "Bottom"], ["shoesId", "Shoes"], ["extraId", null]].forEach(
    ([fieldName, type]) => {
      const select = outfitForm.elements[fieldName];
      select.innerHTML = '<option value="">Skip this slot</option>';
      closet.items
        .filter((i) => i.status === "available")
        .filter((i) => (type ? i.type === type : i.type === "Layer" || i.type === "Accessory"))
        .forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = `${item.name} · ${item.color}`;
          select.append(option);
        });
    }
  );
}

function renderWorkspace() {
  const closet = getSelectedCloset();
  const user = getCurrentUser();

  if (!user || !closet) {
    workspace.classList.add("hidden");
    authPanel.classList.remove("hidden");
    onboardingPanel.classList.add("hidden");
    return;
  }

  authPanel.classList.add("hidden");
  onboardingPanel.classList.add("hidden");
  workspace.classList.remove("hidden");
  workspaceTitle.textContent = `${closet.name} for ${user.name}`;
  shareCodeValue.textContent = closet.shareCode;

  if (latestAiClosetId !== closet.id) { latestAiSuggestion = null; latestAiClosetId = closet.id; }
  if (lastTryOnClosetId !== closet.id) {
    tryOnItemSelect.value = "";
    overlayScaleInput.value = "100";
    overlayOffsetInput.value = "0";
    lastTryOnClosetId = closet.id;
  }

  renderAiSuggestionContent(latestAiSuggestion);
  renderClosetOptions();
  renderStats(closet);
  renderFunStrip(closet);
  renderMembers(closet);
  renderPlannerOptions(closet);
  renderTryOnOptions(closet);
  renderClothes(closet);
  renderHistory(closet);
  renderReminder(closet);
  renderTryOnStage(closet, user);
}

function renderApp() {
  summarizeReset();
  renderSession();
  const user = getCurrentUser();
  if (!user) {
    authPanel.classList.remove("hidden");
    workspace.classList.add("hidden");
    setWorkspaceMessage("");
  }
  renderWorkspace();
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
otpRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = authEmail.value.trim();
  if (!email) { setMessage("Enter your email first.", "error"); return; }
  sendOtpButton.disabled = true;
  sendOtpButton.textContent = "Sending...";
  try {
    const ok = await sendOtp(email);
    if (ok) {
      setMessage(`Code sent to ${email}. Check your inbox.`, "");
      showOtpStep(true);
    }
  } catch (err) {
    setMessage(err.message || "Could not send code. Try again.", "error");
  } finally {
    sendOtpButton.disabled = false;
    sendOtpButton.textContent = "Send code to my email";
  }
});

otpVerifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const otp = authOtp.value.trim();
  if (otp.length !== 6) { setMessage("Enter the 6-digit code.", "error"); return; }
  verifyOtpButton.disabled = true;
  verifyOtpButton.textContent = "Verifying...";
  try {
    await verifyOtp(otp);
  } catch (err) {
    setMessage(err.message || "Verification failed. Try again.", "error");
  } finally {
    verifyOtpButton.disabled = false;
    verifyOtpButton.textContent = "Verify code";
  }
});

backToEmailButton.addEventListener("click", () => {
  showOtpStep(false);
  setMessage("");
});

resendOtpButton.addEventListener("click", async () => {
  if (!pendingOtpEmail) return;
  resendOtpButton.disabled = true;
  setMessage("Sending new code…", "");
  const ok = await sendOtp(pendingOtpEmail);
  if (ok) {
    setMessage(`New code sent to ${pendingOtpEmail}.`, "");
    authOtp.value = "";
    startResendCountdown();
  }
});

onboardingForm.addEventListener("submit", handleOnboardingSubmit);

itemForm.addEventListener("submit", handleItemSubmit);
outfitForm.addEventListener("submit", handleOutfitSubmit);
joinForm.addEventListener("submit", handleJoin);
aiPlannerForm.addEventListener("submit", handleAiPlanner);
manualResetButton.addEventListener("click", handleManualReset);
enableNotificationsButton.addEventListener("click", handleEnableNotifications);
profilePhotoInput.addEventListener("change", handleProfilePhotoUpload);
tryOnForm.addEventListener("input", handleTryOnControls);

closetSelect.addEventListener("change", () => {
  selectedClosetId = closetSelect.value;
  renderApp();
});

filterRow.addEventListener("click", (event) => {
  const button = event.target.closest(".chip");
  if (!button) return;
  activeFilter = button.dataset.filter;
  [...filterRow.querySelectorAll(".chip")].forEach((chip) => {
    chip.classList.toggle("active", chip === button);
  });
  renderWorkspace();
});

searchInput.addEventListener("input", renderWorkspace);

copyShareCodeButton.addEventListener("click", () => {
  const code = shareCodeValue.textContent;
  if (!code || code === "-") return;
  navigator.clipboard.writeText(code)
    .then(() => setWorkspaceMessage("Share code copied to clipboard.", "success"))
    .catch(() => setWorkspaceMessage("Could not copy automatically. Select the code manually.", "error"));
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    document.activeElement !== searchInput &&
    document.activeElement.tagName !== "INPUT" &&
    document.activeElement.tagName !== "TEXTAREA" &&
    document.activeElement.tagName !== "SELECT"
  ) {
    event.preventDefault();
    searchInput.focus();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  summarizeReset();

  // Keep UI in sync when session changes (other tab login, token refresh, expiry)
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      closets = [];
      membersCache = {};
      selectedClosetId = null;
      renderApp();
    } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      await loadUserData();
      renderApp();
    }
  });

  await loadUserData();
  renderApp();
}

init().catch((err) => {
  console.error("Tryunex init error:", err);
  setMessage("Failed to load. Please refresh the page.", "error");
});
