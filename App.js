import "react-native-url-polyfill/auto";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./lib/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const typeOptions = ["Top", "Bottom", "Shoes", "Layer", "Accessory"];

const occasionKeywords = {
  smart: /(office|meeting|work|formal|client)/,
  dressy: /(date|dinner|party|night|partner)/,
  comfort: /(airport|travel|flight|trip)/,
  active: /(gym|run|sport|walk)/,
};

const moodReasons = {
  smart: "Built for a sharper, pulled-together look.",
  dressy: "Leans a bit more polished for evening plans.",
  comfort: "Keeps the outfit easy and comfortable for moving around.",
  active: "Keeps things practical and light.",
  casual: "A balanced everyday outfit from what is ready to wear.",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function mostRecentSundayKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return todayKey(d);
}

function makeShareCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
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

function getOccasionMood(occasionText) {
  const text = String(occasionText).toLowerCase();
  if (occasionKeywords.smart.test(text)) return "smart";
  if (occasionKeywords.dressy.test(text)) return "dressy";
  if (occasionKeywords.comfort.test(text)) return "comfort";
  if (occasionKeywords.active.test(text)) return "active";
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

function chooseBestItem(items, type, mood, usedIds) {
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
  return {
    mood,
    picks: { top, bottom, shoes, extra },
    summary: picks.map((i) => i.name).join(", "),
    reason: moodReasons[mood],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA NORMALIZATION
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
// IMAGE UPLOAD  (Supabase Storage)
// ─────────────────────────────────────────────────────────────────────────────
async function uploadImageToStorage(uri, path) {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const { data, error } = await supabase.storage.from("wardrobe").upload(path, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from("wardrobe").getPublicUrl(data.path);
    return publicUrl;
  } catch (e) {
    console.warn("Image upload failed", e);
    return "";
  }
}

async function pickAndUploadImage(uploadPath) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== "granted") {
    Alert.alert("Permission needed", "Please allow photo access to upload images.");
    return "";
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.length) return "";
  const uri = result.assets[0].uri;
  return uploadImageToStorage(uri, uploadPath);
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StatCard({ value, label }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Tag({ label, tone = "sage" }) {
  return (
    <View style={[styles.tag, tone === "gold" && styles.tagGold]}>
      <Text style={[styles.tagText, tone === "gold" && styles.tagTextGold]}>{label}</Text>
    </View>
  );
}

function PickerField({ label, value, onChange, items = [], itemLabel }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pickerShell}>
        <Picker selectedValue={value} onValueChange={onChange} style={styles.picker}>
          <Picker.Item label="Skip this slot" value="" />
          {items.map((item) => (
            <Picker.Item
              key={item.id}
              label={itemLabel ? itemLabel(item) : `${item.name} · ${item.color}`}
              value={item.id}
            />
          ))}
        </Picker>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  // ── Auth & data state ──────────────────────────────────────────────────────
  const [authUserId, setAuthUserId] = useState(null);
  const [users, setUsers] = useState([]);          // profiles cache
  const [closets, setClosets] = useState([]);
  const [selectedClosetId, setSelectedClosetId] = useState(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── UI form state ──────────────────────────────────────────────────────────
  const [authMode, setAuthMode] = useState("login");
  const [authMessage, setAuthMessage] = useState("");
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [latestAiSuggestion, setLatestAiSuggestion] = useState(null);

  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const [itemDraft, setItemDraft] = useState({ name: "", type: "", color: "", notes: "", image: "" });
  const [outfitDraft, setOutfitDraft] = useState({ occasion: "", topId: "", bottomId: "", shoesId: "", extraId: "", comment: "" });
  const [joinCode, setJoinCode] = useState("");
  const [aiOccasion, setAiOccasion] = useState("");
  const [tryOnItemId, setTryOnItemId] = useState("");
  const [overlayScale, setOverlayScale] = useState(100);
  const [overlayOffset, setOverlayOffset] = useState(0);

  // ── Auto-clear success messages ────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceMessage) return;
    const timer = setTimeout(() => setWorkspaceMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [workspaceMessage]);

  // ── Load data from Supabase ────────────────────────────────────────────────
  const loadData = useCallback(async (userId) => {
    if (!userId) {
      setUsers([]);
      setClosets([]);
      setSelectedClosetId(null);
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
    const currentProfile = profile
      ? { id: profile.id, name: profile.name, email: profile.email, password: "", profileImage: profile.profile_image_url }
      : null;

    const { data: memberships } = await supabase.from("closet_members").select("closet_id").eq("user_id", userId);
    if (!memberships?.length) {
      setUsers(currentProfile ? [currentProfile] : []);
      setClosets([]);
      return;
    }

    const closetIds = memberships.map((m) => m.closet_id);
    const { data: closetRows } = await supabase.from("closets").select("*").in("id", closetIds);

    const profilesCache = currentProfile ? { [userId]: currentProfile } : {};

    const normalizedClosets = await Promise.all(
      (closetRows || []).map(async (closet) => {
        const [{ data: memberRows }, { data: itemRows }, { data: outfitRows }] = await Promise.all([
          supabase.from("closet_members").select("user_id, profiles(id, name, email, profile_image_url)").eq("closet_id", closet.id),
          supabase.from("items").select("*").eq("closet_id", closet.id).order("created_at", { ascending: false }),
          supabase.from("outfits").select("*").eq("closet_id", closet.id).order("created_at", { ascending: false }),
        ]);

        (memberRows || []).forEach((m) => {
          if (m.profiles && !profilesCache[m.user_id]) {
            profilesCache[m.user_id] = {
              id: m.user_id,
              name: m.profiles.name,
              email: m.profiles.email,
              password: "",
              profileImage: m.profiles.profile_image_url,
            };
          }
        });

        return normalizeCloset(closet, memberRows, itemRows, outfitRows);
      })
    );

    // Weekly reset check
    const currentSunday = mostRecentSundayKey();
    await Promise.all(
      normalizedClosets
        .filter((c) => c.lastLaundryReset !== currentSunday)
        .map((c) =>
          Promise.all([
            supabase.from("closets").update({ last_laundry_reset: currentSunday }).eq("id", c.id),
            supabase.from("items").update({ status: "available" }).eq("closet_id", c.id),
          ])
        )
    );

    setUsers(Object.values(profilesCache));
    setClosets(normalizedClosets);
    setSelectedClosetId((prev) => {
      if (prev && normalizedClosets.find((c) => c.id === prev)) return prev;
      return normalizedClosets[0]?.id || null;
    });
  }, []);

  // ── Supabase auth listener ─────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const userId = session?.user?.id || null;
      setAuthUserId(userId);
      await loadData(userId);
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const userId = session?.user?.id || null;
      setAuthUserId(userId);
      if (event === "SIGNED_OUT") {
        setUsers([]);
        setClosets([]);
        setSelectedClosetId(null);
      } else if (userId) {
        await loadData(userId);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadData]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const currentUser = useMemo(
    () => users.find((u) => u.id === authUserId) || null,
    [users, authUserId]
  );

  const accessibleClosets = useMemo(() => closets, [closets]);

  const selectedCloset = useMemo(
    () => accessibleClosets.find((c) => c.id === selectedClosetId) || accessibleClosets[0] || null,
    [accessibleClosets, selectedClosetId]
  );

  useEffect(() => {
    if (!selectedCloset) { setTryOnItemId(""); setLatestAiSuggestion(null); return; }
    setTryOnItemId((cur) => (selectedCloset.items.some((i) => i.id === cur) ? cur : ""));
  }, [selectedCloset]);

  const filteredItems = useMemo(() => {
    if (!selectedCloset) return [];
    return selectedCloset.items.filter((item) => {
      const matchesFilter = filter === "all" || item.status === filter;
      const matchesSearch =
        !search ||
        [item.name, item.type, item.color, item.notes].join(" ").toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [filter, search, selectedCloset]);

  const plannerOptions = useMemo(() => {
    if (!selectedCloset) return {};
    const available = selectedCloset.items.filter((i) => i.status === "available");
    return {
      top: available.filter((i) => i.type === "Top"),
      bottom: available.filter((i) => i.type === "Bottom"),
      shoes: available.filter((i) => i.type === "Shoes"),
      extra: available.filter((i) => i.type === "Layer" || i.type === "Accessory"),
    };
  }, [selectedCloset]);

  const funSummary = useMemo(() => {
    if (!selectedCloset) return { title: "Closet energy loading", badge: "WAITING", copy: "Your wardrobe mood will show up here.", tags: [], meter: 0, meterCopy: "Your closet personality meter is waking up." };
    const available = selectedCloset.items.filter((i) => i.status === "available").length;
    const worn = selectedCloset.items.filter((i) => i.status === "worn").length;
    const total = selectedCloset.items.length || 1;
    const shareCount = selectedCloset.memberIds.length;
    const outfitCount = selectedCloset.outfitHistory.length;
    const recentOccasion = selectedCloset.outfitHistory[0]?.occasion || "first look pending";
    const aiMood = latestAiSuggestion?.mood || "AI ready";
    let title = "Fresh closet energy"; let badge = "BALANCED"; let copy = "You have a nice mix of ready-to-wear pieces and room to play with outfits.";
    if (worn >= Math.max(3, Math.ceil(total * 0.45))) { title = "Laundry day drama"; badge = "WASH MODE"; copy = "A good chunk of the closet is in the worn pile. One reset and you are back in business."; }
    else if (outfitCount >= 5) { title = "Main character wardrobe"; badge = "HOT STREAK"; copy = "You have been planning looks consistently. This closet has momentum."; }
    else if (shareCount > 1) { title = "Wardrobe partner mode"; badge = "CO-OP"; copy = "Shared taste is in the room. Expect stronger opinions and better outfits."; }
    const meter = Math.min(100, 28 + outfitCount * 8 + shareCount * 10 + Math.round((available / total) * 30));
    return {
      title, badge, copy,
      tags: [`${available} ready now`, `${worn} in worn pile`, `${outfitCount} looks logged`, shareCount > 1 ? `${shareCount} stylists inside` : "solo styling", `last plan: ${recentOccasion}`, `AI mood: ${aiMood}`],
      meter,
      meterCopy: meter >= 80 ? "This closet is lively, collaborative, and fully in its groove." : meter >= 55 ? "The wardrobe has good rhythm. A few more outfit plans and it really pops." : "You have the base. Add a few more looks and the vibe meter will climb fast.",
    };
  }, [latestAiSuggestion, selectedCloset]);

  const reminderSummary = useMemo(() => {
    if (!selectedCloset) return { title: "Reminder status will show here.", copy: "We will watch your worn pile and remind you when it feels like wash time." };
    const worn = selectedCloset.items.filter((i) => i.status === "worn").length;
    if (worn >= 3) return { title: `Wash reminder: ${worn} items are in the worn pile.`, copy: "Your closet is starting to stack up. Sunday reset will move them back automatically." };
    if (worn > 0) return { title: `${worn} item${worn === 1 ? "" : "s"} waiting for wash.`, copy: "You are still fine, but the reminder will get stronger as more clothes move to worn." };
    return { title: "Closet is fresh right now.", copy: "No clothes are sitting in the worn pile." };
  }, [selectedCloset]);

  const tryOnItem = useMemo(
    () => selectedCloset?.items.find((i) => i.id === tryOnItemId) || null,
    [selectedCloset, tryOnItemId]
  );

  const selectedMembers = useMemo(() => {
    if (!selectedCloset) return [];
    return selectedCloset.memberIds.map((id) => users.find((u) => u.id === id)).filter(Boolean);
  }, [selectedCloset, users]);

  const aiLines = latestAiSuggestion
    ? [
        latestAiSuggestion.picks.top ? `Top: ${latestAiSuggestion.picks.top.name}` : "",
        latestAiSuggestion.picks.bottom ? `Bottom: ${latestAiSuggestion.picks.bottom.name}` : "",
        latestAiSuggestion.picks.shoes ? `Shoes: ${latestAiSuggestion.picks.shoes.name}` : "",
        latestAiSuggestion.picks.extra ? `Extra: ${latestAiSuggestion.picks.extra.name}` : "",
      ].filter(Boolean)
    : [];

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
    if (error) { setAuthMessage(error.message); return; }
    setAuthEmail(""); setAuthPassword(""); setAuthMessage("");
  }

  async function handleSignup() {
    if (!authName.trim()) { setAuthMessage("Add your name to create the wardrobe."); return; }
    const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
    if (error) { setAuthMessage(error.message); return; }
    const userId = data.user?.id;
    if (!userId) { setAuthMessage("Signup failed. Please try again."); return; }

    const shareCode = makeShareCode();
    await supabase.from("profiles").insert({ id: userId, name: authName.trim(), email: authEmail.trim() });
    const { data: closet } = await supabase.from("closets").insert({
      owner_id: userId,
      name: `${authName.trim()}'s Wardrobe`,
      share_code: shareCode,
      last_laundry_reset: mostRecentSundayKey(),
    }).select().single();
    if (closet) {
      await supabase.from("closet_members").insert({ closet_id: closet.id, user_id: userId });
    }

    setAuthName(""); setAuthEmail(""); setAuthPassword(""); setAuthMessage("");
    await loadData(userId);
  }

  async function handleItemImagePick() {
    if (!currentUser || !selectedCloset) return;
    setSaving(true);
    const url = await pickAndUploadImage(`items/${Date.now()}.jpg`);
    setSaving(false);
    if (url) {
      setItemDraft((cur) => ({ ...cur, image: url }));
      setWorkspaceMessage("Clothing photo added.");
    }
  }

  async function handleAddItem() {
    if (!selectedCloset || !currentUser) return;
    if (!itemDraft.name.trim() || !itemDraft.type || !itemDraft.color.trim()) {
      setWorkspaceMessage("Add clothing name, type, and color first.");
      return;
    }
    setSaving(true);
    await supabase.from("items").insert({
      closet_id: selectedCloset.id,
      name: itemDraft.name.trim(),
      type: itemDraft.type,
      color: itemDraft.color.trim(),
      notes: itemDraft.notes.trim(),
      image_url: itemDraft.image,
    });
    setItemDraft({ name: "", type: "", color: "", notes: "", image: "" });
    setWorkspaceMessage("Clothing item added to your wardrobe.");
    await loadData(authUserId);
    setSaving(false);
  }

  async function handleOutfitSave() {
    if (!selectedCloset || !currentUser) return;
    const itemIds = [outfitDraft.topId, outfitDraft.bottomId, outfitDraft.shoesId, outfitDraft.extraId].filter(Boolean);
    if (!itemIds.length) { setWorkspaceMessage("Select at least one clothing item before saving the outfit."); return; }
    setSaving(true);
    await Promise.all([
      supabase.from("outfits").insert({
        closet_id: selectedCloset.id,
        occasion: outfitDraft.occasion.trim() || "Planned look",
        comment: outfitDraft.comment.trim(),
        chosen_by_user_id: currentUser.id,
        item_ids: itemIds,
      }),
      supabase.from("items").update({ status: "worn", last_worn_on: todayKey() }).in("id", itemIds),
    ]);
    setOutfitDraft({ occasion: "", topId: "", bottomId: "", shoesId: "", extraId: "", comment: "" });
    setWorkspaceMessage("Outfit saved and selected clothes moved to worn.");
    await loadData(authUserId);
    setSaving(false);
  }

  async function handleJoinWardrobe() {
    if (!currentUser) return;
    const code = joinCode.trim().toUpperCase();
    const { data: closet } = await supabase.from("closets").select("*").eq("share_code", code).single();
    if (!closet) { setWorkspaceMessage("That share code was not found."); return; }
    if (closets.some((c) => c.id === closet.id)) { setWorkspaceMessage("You already have access to that wardrobe."); return; }
    await supabase.from("closet_members").insert({ closet_id: closet.id, user_id: currentUser.id });
    setSelectedClosetId(closet.id);
    setJoinCode("");
    setWorkspaceMessage("Shared wardrobe joined successfully.");
    await loadData(authUserId);
  }

  async function handleManualReset() {
    if (!selectedCloset) return;
    setSaving(true);
    await Promise.all([
      supabase.from("closets").update({ last_laundry_reset: mostRecentSundayKey() }).eq("id", selectedCloset.id),
      supabase.from("items").update({ status: "available" }).eq("closet_id", selectedCloset.id),
    ]);
    setWorkspaceMessage("All clothes were moved back to available.");
    await loadData(authUserId);
    setSaving(false);
  }

  async function handleToggleStatus(itemId) {
    if (!selectedCloset) return;
    const item = selectedCloset.items.find((i) => i.id === itemId);
    if (!item) return;
    const newStatus = item.status === "available" ? "worn" : "available";
    await supabase.from("items").update({
      status: newStatus,
      last_worn_on: newStatus === "worn" ? todayKey() : (item.lastWornOn || null),
    }).eq("id", itemId);
    await loadData(authUserId);
  }

  async function handleDeleteItem(itemId) {
    if (!selectedCloset) return;
    Alert.alert(
      "Remove item",
      "Remove this item from your wardrobe?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await supabase.from("items").delete().eq("id", itemId);
            setWorkspaceMessage("Item removed from your wardrobe.");
            await loadData(authUserId);
          },
        },
      ]
    );
  }

  function handleAiSuggest() {
    if (!selectedCloset) return;
    const suggestion = buildAiSuggestion(selectedCloset, aiOccasion);
    if (!suggestion) {
      setLatestAiSuggestion(null);
      setWorkspaceMessage("The AI stylist needs more available clothes to suggest an outfit.");
      return;
    }
    setLatestAiSuggestion(suggestion);
    setOutfitDraft((cur) => ({
      ...cur,
      occasion: aiOccasion,
      topId: suggestion.picks.top?.id || "",
      bottomId: suggestion.picks.bottom?.id || "",
      shoesId: suggestion.picks.shoes?.id || "",
      extraId: suggestion.picks.extra?.id || "",
      comment: `AI stylist suggestion for ${aiOccasion || "today"}`,
    }));
    setWorkspaceMessage("AI stylist suggested an outfit and filled the planner form.");
  }

  async function handleProfileImagePick() {
    if (!currentUser) return;
    setSaving(true);
    const url = await pickAndUploadImage(`profiles/${currentUser.id}.jpg`);
    if (url) {
      await supabase.from("profiles").update({ profile_image_url: url }).eq("id", currentUser.id);
      setWorkspaceMessage("Your photo was added for try-on preview.");
      await loadData(authUserId);
    }
    setSaving(false);
  }

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.loadingTitle}>Loading Tryunex</Text>
          <Text style={styles.loadingCopy}>Getting your wardrobe ready.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.page}>

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <View style={styles.topbar}>
          <View>
            <Text style={styles.brand}>Tryunex</Text>
            <Text style={styles.brandSub}>shared wardrobe planner</Text>
          </View>
          <View style={styles.topbarMeta}>
            <Text style={styles.dayPill}>
              Last laundry cycle reset: {formatDate(mostRecentSundayKey())}
            </Text>
            {currentUser ? (
              <Pressable
                onPress={async () => { await supabase.auth.signOut(); }}
                style={styles.ghostButton}
              >
                <Text style={styles.ghostButtonText}>Logout {currentUser.name}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>Wear. Track. Reset. Share.</Text>
            <Text style={styles.heroTitle}>
              Your wardrobe, your worn list, and your wardrobe partner's outfit picks in one place.
            </Text>
            <Text style={styles.heroCopy}>
              Create an account to get started. Share your wardrobe code with your partner so they can join from their own device.
            </Text>
            <View style={styles.heroNotes}>
              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>Cross-platform</Text>
                <Text style={styles.noteCopy}>Same app for web and Android, real data across devices.</Text>
              </View>
              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>Shared planning</Text>
                <Text style={styles.noteCopy}>Wardrobe partner access, outfit history, and AI suggestions.</Text>
              </View>
              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>Weekly reset</Text>
                <Text style={styles.noteCopy}>Worn items move back after the Sunday wash cycle.</Text>
              </View>
            </View>
          </View>

          {/* ── Auth panel ──────────────────────────────────────────────── */}
          {!currentUser ? (
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>Account</Text>
              <Text style={styles.panelTitle}>
                {authMode === "login" ? "Welcome back" : "Create your wardrobe"}
              </Text>

              <View style={styles.row}>
                <Chip label="Login" active={authMode === "login"} onPress={() => { setAuthMode("login"); setAuthMessage(""); }} />
                <Chip label="Create account" active={authMode === "signup"} onPress={() => { setAuthMode("signup"); setAuthMessage(""); }} />
              </View>

              {authMode === "signup" ? (
                <TextInput placeholder="Name" style={styles.input} value={authName} onChangeText={setAuthName} />
              ) : null}
              <TextInput placeholder="Email" autoCapitalize="none" keyboardType="email-address" style={styles.input} value={authEmail} onChangeText={setAuthEmail} />
              <TextInput placeholder="Password" secureTextEntry style={styles.input} value={authPassword} onChangeText={setAuthPassword} />
              <Pressable onPress={authMode === "login" ? handleLogin : handleSignup} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{authMode === "login" ? "Login" : "Create account"}</Text>
              </Pressable>
              {authMessage ? <Text style={styles.errorText}>{authMessage}</Text> : null}
            </View>
          ) : null}
        </View>

        {/* ── Workspace (logged in) ─────────────────────────────────────── */}
        {currentUser && selectedCloset ? (
          <>
            <View style={styles.workspaceHeader}>
              <View>
                <Text style={styles.eyebrow}>Dashboard</Text>
                <Text style={styles.workspaceTitle}>{selectedCloset.name} for {currentUser.name}</Text>
              </View>
              <View style={styles.workspaceActions}>
                <View style={styles.pickerShell}>
                  <Text style={styles.fieldLabel}>Closet</Text>
                  <Picker selectedValue={selectedCloset.id} onValueChange={setSelectedClosetId} style={styles.picker}>
                    {accessibleClosets.map((c) => (
                      <Picker.Item key={c.id} label={c.name} value={c.id} />
                    ))}
                  </Picker>
                </View>
                <Pressable onPress={handleManualReset} style={styles.secondaryButton} disabled={saving}>
                  <Text style={styles.secondaryButtonText}>Reset clothes as washed</Text>
                </Pressable>
              </View>
            </View>

            {workspaceMessage ? <Text style={styles.successText}>{workspaceMessage}</Text> : null}

            {/* Fun strip */}
            <View style={styles.funStrip}>
              <View style={styles.funCard}>
                <Text style={styles.eyebrow}>Today's vibe</Text>
                <View style={styles.spaceBetween}>
                  <Text style={styles.funTitle}>{funSummary.title}</Text>
                  <Tag label={funSummary.badge} />
                </View>
                <Text style={styles.bodyCopy}>{funSummary.copy}</Text>
                <View style={styles.tagWrap}>
                  {funSummary.tags.map((tag) => (<Tag key={tag} label={tag} />))}
                </View>
              </View>
              <View style={styles.funCard}>
                <Text style={styles.eyebrow}>Fun meter</Text>
                <Text style={styles.funBig}>{funSummary.meter}%</Text>
                <Text style={styles.bodyCopy}>{funSummary.meterCopy}</Text>
                <View style={styles.meterTrack}>
                  <View style={[styles.meterFill, { width: `${funSummary.meter}%` }]} />
                </View>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsGrid}>
              <StatCard value={selectedCloset.items.filter((i) => i.status === "available").length} label="Ready to wear" />
              <StatCard value={selectedCloset.items.filter((i) => i.status === "worn").length} label="In worn pile" />
              <StatCard value={selectedCloset.outfitHistory.length} label="Outfits planned" />
              <StatCard value={selectedCloset.memberIds.length} label="Closet members" />
            </View>

            <View style={styles.columns}>
              {/* ── Main column ─────────────────────────────────────────── */}
              <View style={styles.mainColumn}>

                {/* Add clothes */}
                <View style={styles.panel}>
                  <Text style={styles.eyebrow}>Add clothes</Text>
                  <Text style={styles.panelTitle}>Upload to wardrobe</Text>
                  <TextInput placeholder="Clothing name" style={styles.input} value={itemDraft.name} onChangeText={(v) => setItemDraft((c) => ({ ...c, name: v }))} />
                  <View style={styles.splitRow}>
                    <View style={styles.flexOne}>
                      <Text style={styles.fieldLabel}>Type</Text>
                      <View style={styles.pickerShell}>
                        <Picker selectedValue={itemDraft.type} onValueChange={(v) => setItemDraft((c) => ({ ...c, type: v }))} style={styles.picker}>
                          <Picker.Item label="Select" value="" />
                          {typeOptions.map((o) => (<Picker.Item key={o} label={o} value={o} />))}
                        </Picker>
                      </View>
                    </View>
                    <View style={styles.flexOne}>
                      <TextInput placeholder="Color" style={styles.input} value={itemDraft.color} onChangeText={(v) => setItemDraft((c) => ({ ...c, color: v }))} />
                    </View>
                  </View>
                  <TextInput placeholder="Notes" style={[styles.input, styles.textarea]} multiline value={itemDraft.notes} onChangeText={(v) => setItemDraft((c) => ({ ...c, notes: v }))} />
                  <Pressable onPress={handleItemImagePick} style={styles.secondaryButton} disabled={saving}>
                    <Text style={styles.secondaryButtonText}>{itemDraft.image ? "Change clothing photo" : "Add clothing photo"}</Text>
                  </Pressable>
                  <Pressable onPress={handleAddItem} style={styles.primaryButton} disabled={saving}>
                    <Text style={styles.primaryButtonText}>Add to closet</Text>
                  </Pressable>
                </View>

                {/* Plan outfit */}
                <View style={styles.panel}>
                  <Text style={styles.eyebrow}>Plan outfit</Text>
                  <Text style={styles.panelTitle}>Mark clothes as worn</Text>
                  <TextInput placeholder="Going where?" style={styles.input} value={outfitDraft.occasion} onChangeText={(v) => setOutfitDraft((c) => ({ ...c, occasion: v }))} />
                  <PickerField label="Top" value={outfitDraft.topId} onChange={(v) => setOutfitDraft((c) => ({ ...c, topId: v }))} items={plannerOptions.top} />
                  <PickerField label="Bottom" value={outfitDraft.bottomId} onChange={(v) => setOutfitDraft((c) => ({ ...c, bottomId: v }))} items={plannerOptions.bottom} />
                  <PickerField label="Shoes" value={outfitDraft.shoesId} onChange={(v) => setOutfitDraft((c) => ({ ...c, shoesId: v }))} items={plannerOptions.shoes} />
                  <PickerField label="Layer or accessory" value={outfitDraft.extraId} onChange={(v) => setOutfitDraft((c) => ({ ...c, extraId: v }))} items={plannerOptions.extra} />
                  <TextInput placeholder="Comment" style={[styles.input, styles.textarea]} multiline value={outfitDraft.comment} onChangeText={(v) => setOutfitDraft((c) => ({ ...c, comment: v }))} />
                  <Pressable onPress={handleOutfitSave} style={styles.primaryButton} disabled={saving}>
                    <Text style={styles.primaryButtonText}>Save outfit and move items to worn</Text>
                  </Pressable>
                </View>

                {/* Closet grid */}
                <View style={styles.panel}>
                  <View style={styles.spaceBetween}>
                    <View>
                      <Text style={styles.eyebrow}>Closet</Text>
                      <Text style={styles.panelTitle}>Available and worn</Text>
                    </View>
                    <TextInput placeholder="Search" style={[styles.input, styles.searchInput]} value={search} onChangeText={setSearch} />
                  </View>
                  <View style={styles.rowWrap}>
                    <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
                    <Chip label="Available" active={filter === "available"} onPress={() => setFilter("available")} />
                    <Chip label="Worn" active={filter === "worn"} onPress={() => setFilter("worn")} />
                  </View>
                  <View style={styles.cardGrid}>
                    {filteredItems.map((item) => (
                      <View key={item.id} style={styles.itemCard}>
                        {item.image
                          ? <Image source={{ uri: item.image }} style={styles.itemImage} />
                          : <View style={[styles.itemImage, { backgroundColor: item.status === "available" ? "#e9d8cb" : "#e0d8c2" }]} />
                        }
                        <View style={styles.itemBody}>
                          <View style={styles.spaceBetween}>
                            <Tag label={item.type} />
                            <Tag label={item.status} tone={item.status === "worn" ? "gold" : "sage"} />
                          </View>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemNotes}>{item.notes || `${item.color} ${item.type.toLowerCase()}`}</Text>
                          <View style={styles.spaceBetween}>
                            <Text style={styles.smallText}>
                              {item.lastWornOn ? `Last worn ${formatDate(item.lastWornOn)}` : `${item.color} and ready`}
                            </Text>
                            <View style={styles.row}>
                              <Pressable onPress={() => handleToggleStatus(item.id)} style={styles.secondaryButtonSmall}>
                                <Text style={styles.secondaryButtonText}>{item.status === "available" ? "Mark worn" : "Return"}</Text>
                              </Pressable>
                              <Pressable onPress={() => handleDeleteItem(item.id)} style={styles.deleteButtonSmall}>
                                <Text style={styles.deleteButtonText}>Remove</Text>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                  {!filteredItems.length ? <Text style={styles.emptyText}>No clothes match this view yet.</Text> : null}
                </View>
              </View>

              {/* ── Side column ─────────────────────────────────────────── */}
              <View style={styles.sideColumn}>

                {/* Shared access */}
                <View style={styles.panel}>
                  <Text style={styles.eyebrow}>Shared access</Text>
                  <Text style={styles.panelTitle}>Invite your wardrobe partner</Text>
                  <View style={styles.infoCard}>
                    <Text style={styles.smallText}>Share code</Text>
                    <Text style={styles.shareCode}>{selectedCloset.shareCode}</Text>
                    <Text style={styles.bodyCopy}>Anyone with this code can join the closet from another account.</Text>
                  </View>
                  <TextInput placeholder="Enter share code" style={styles.input} value={joinCode} onChangeText={setJoinCode} autoCapitalize="characters" />
                  <Pressable onPress={handleJoinWardrobe} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Join with code</Text>
                  </Pressable>
                  {selectedMembers.map((member) => (
                    <View key={member.id} style={styles.memberCard}>
                      <View>
                        <Text style={styles.memberName}>{member.name}</Text>
                        <Text style={styles.smallText}>{member.email}</Text>
                      </View>
                      <Tag label={member.id === selectedCloset.ownerId ? "Owner" : "Member"} />
                    </View>
                  ))}
                </View>

                {/* AI stylist */}
                <View style={styles.panel}>
                  <Text style={styles.eyebrow}>AI stylist</Text>
                  <Text style={styles.panelTitle}>Plan my wardrobe</Text>
                  <TextInput placeholder="Occasion for suggestion" style={styles.input} value={aiOccasion} onChangeText={setAiOccasion} />
                  <Pressable onPress={handleAiSuggest} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Suggest outfit</Text>
                  </Pressable>
                  <View style={styles.infoCard}>
                    <Text style={styles.memberName}>{latestAiSuggestion ? latestAiSuggestion.summary : "AI suggestion will appear here."}</Text>
                    <Text style={styles.bodyCopy}>
                      {latestAiSuggestion
                        ? `${latestAiSuggestion.reason} ${aiLines.join(" | ")}`
                        : "It will choose from your available clothes and fill the outfit planner for you."}
                    </Text>
                  </View>
                </View>

                {/* Wash reminder */}
                <View style={styles.panel}>
                  <Text style={styles.eyebrow}>Wash reminder</Text>
                  <Text style={styles.panelTitle}>Laundry status</Text>
                  <View style={styles.infoCard}>
                    <Text style={styles.memberName}>{reminderSummary.title}</Text>
                    <Text style={styles.bodyCopy}>{reminderSummary.copy}</Text>
                  </View>
                </View>

                {/* Try-on preview */}
                <View style={styles.panel}>
                  <Text style={styles.eyebrow}>Try-on preview</Text>
                  <Text style={styles.panelTitle}>See yourself with a dress</Text>
                  <Pressable onPress={handleProfileImagePick} style={styles.secondaryButton} disabled={saving}>
                    <Text style={styles.secondaryButtonText}>{currentUser.profileImage ? "Change your photo" : "Upload your photo"}</Text>
                  </Pressable>
                  <PickerField label="Pick a clothing item" value={tryOnItemId} onChange={setTryOnItemId} items={selectedCloset.items} itemLabel={(item) => `${item.name} · ${item.type}`} />
                  <Text style={styles.fieldLabel}>Dress scale</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={String(overlayScale)} onChangeText={(v) => setOverlayScale(Number(v) || 100)} />
                  <Text style={styles.fieldLabel}>Dress height</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={String(overlayOffset)} onChangeText={(v) => setOverlayOffset(Number(v) || 0)} />
                  <View style={styles.tryOnStage}>
                    {currentUser.profileImage
                      ? <Image source={{ uri: currentUser.profileImage }} style={styles.tryOnAvatar} />
                      : <View style={styles.tryOnPlaceholder}><Text style={styles.smallText}>Upload your photo to start the preview</Text></View>
                    }
                    {tryOnItem ? (
                      tryOnItem.image
                        ? <Image source={{ uri: tryOnItem.image }} style={[styles.tryOnGarment, { transform: [{ translateY: overlayOffset }, { scale: Math.max(0.7, Math.min(1.4, overlayScale / 100)) }] }]} />
                        : <View style={[styles.tryOnGarment, styles.tryOnGarmentFallback, { transform: [{ translateY: overlayOffset }, { scale: Math.max(0.7, Math.min(1.4, overlayScale / 100)) }] }]}>
                            <Text style={styles.smallText}>{tryOnItem.name}</Text>
                          </View>
                    ) : null}
                  </View>
                  <Text style={styles.smallText}>This is a quick style preview. A true AI virtual try-on would need a stronger image model and backend.</Text>
                </View>

                {/* Outfit history */}
                <View style={styles.panel}>
                  <Text style={styles.eyebrow}>Outfit history</Text>
                  <Text style={styles.panelTitle}>Recent picks</Text>
                  {selectedCloset.outfitHistory.map((entry) => {
                    const chooser = users.find((u) => u.id === entry.chosenByUserId)?.name || "Member";
                    const itemNames = entry.itemIds.map((id) => selectedCloset.items.find((i) => i.id === id)?.name).filter(Boolean).join(", ");
                    return (
                      <View key={entry.id} style={styles.historyCard}>
                        <View style={styles.spaceBetween}>
                          <Text style={styles.memberName}>{entry.occasion}</Text>
                          <Tag label={chooser} />
                        </View>
                        <Text style={styles.bodyCopy}>{itemNames}{entry.comment ? `. ${entry.comment}` : ""}</Text>
                        <Text style={styles.smallText}>{formatDate(entry.createdAt)}</Text>
                      </View>
                    );
                  })}
                  {!selectedCloset.outfitHistory.length ? <Text style={styles.emptyText}>No outfits planned yet.</Text> : null}
                </View>

              </View>
            </View>
          </>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f1e9" },
  page: { padding: 16, paddingBottom: 48, gap: 18 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingTitle: { fontSize: 28, fontWeight: "700", color: "#251d18" },
  loadingCopy: { marginTop: 10, textAlign: "center", color: "#6d6259" },
  topbar: { padding: 20, borderRadius: 24, backgroundColor: "#fffaf4", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)", gap: 14 },
  brand: { fontSize: 26, fontWeight: "700", color: "#251d18" },
  brandSub: { marginTop: 4, color: "#6d6259" },
  topbarMeta: { gap: 12 },
  dayPill: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#f3ece4", color: "#6d6259" },
  hero: { gap: 18 },
  heroCard: { padding: 24, borderRadius: 28, backgroundColor: "#fff9f3", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)" },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase", color: "#8a3212", marginBottom: 10 },
  heroTitle: { fontSize: 34, lineHeight: 38, fontWeight: "700", color: "#251d18" },
  heroCopy: { marginTop: 16, fontSize: 16, lineHeight: 24, color: "#6d6259" },
  heroNotes: { marginTop: 18, gap: 12 },
  noteCard: { padding: 16, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)" },
  noteTitle: { fontWeight: "700", color: "#251d18" },
  noteCopy: { marginTop: 6, color: "#6d6259", lineHeight: 20 },
  panel: { padding: 20, borderRadius: 24, backgroundColor: "#fffaf4", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)", gap: 12 },
  panelTitle: { fontSize: 24, fontWeight: "700", color: "#251d18" },
  infoCard: { padding: 14, borderRadius: 18, backgroundColor: "#f6eee6", borderWidth: 1, borderColor: "rgba(31,26,23,0.06)", gap: 6 },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)" },
  chipActive: { backgroundColor: "#27544a", borderColor: "#27544a" },
  chipText: { color: "#251d18", fontWeight: "600" },
  chipTextActive: { color: "#f9fbfa" },
  input: { borderWidth: 1, borderColor: "rgba(31,26,23,0.1)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#fff", color: "#251d18" },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  primaryButton: { minHeight: 50, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "#c85c2d", paddingHorizontal: 18 },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
  secondaryButton: { minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(31,26,23,0.1)" },
  secondaryButtonSmall: { minHeight: 36, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(31,26,23,0.1)" },
  secondaryButtonText: { color: "#251d18", fontWeight: "600" },
  deleteButtonSmall: { minHeight: 36, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, backgroundColor: "rgba(181,77,51,0.08)", borderWidth: 1, borderColor: "rgba(181,77,51,0.18)" },
  deleteButtonText: { color: "#b54d33", fontWeight: "600", fontSize: 13 },
  ghostButton: { alignSelf: "flex-start", minHeight: 44, borderRadius: 999, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)", backgroundColor: "#fff" },
  ghostButtonText: { color: "#251d18", fontWeight: "600" },
  errorText: { color: "#b54d33" },
  successText: { color: "#27544a", paddingHorizontal: 4 },
  workspaceHeader: { gap: 14 },
  workspaceTitle: { fontSize: 30, lineHeight: 34, fontWeight: "700", color: "#251d18" },
  workspaceActions: { gap: 12 },
  pickerShell: { borderWidth: 1, borderColor: "rgba(31,26,23,0.1)", borderRadius: 16, backgroundColor: "#fff", overflow: "hidden" },
  picker: { color: "#251d18" },
  fieldLabel: { fontSize: 13, color: "#6d6259", marginBottom: 6 },
  funStrip: { gap: 16 },
  funCard: { padding: 18, borderRadius: 22, backgroundColor: "#fff8f1", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)", gap: 10 },
  funTitle: { flex: 1, fontSize: 24, fontWeight: "700", color: "#251d18" },
  funBig: { fontSize: 30, fontWeight: "700", color: "#251d18" },
  bodyCopy: { color: "#6d6259", lineHeight: 22 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(39,84,74,0.08)" },
  tagGold: { backgroundColor: "rgba(229,184,96,0.22)" },
  tagText: { color: "#27544a", fontSize: 12, fontWeight: "600" },
  tagTextGold: { color: "#8e5b09" },
  meterTrack: { height: 14, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(31,26,23,0.08)" },
  meterFill: { height: "100%", borderRadius: 999, backgroundColor: "#c85c2d" },
  statsGrid: { gap: 14 },
  statCard: { padding: 18, borderRadius: 22, backgroundColor: "#fffaf4", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)" },
  statValue: { fontSize: 28, fontWeight: "700", color: "#251d18" },
  statLabel: { marginTop: 6, color: "#6d6259" },
  columns: { gap: 18 },
  mainColumn: { gap: 18 },
  sideColumn: { gap: 18 },
  splitRow: { flexDirection: "row", gap: 12 },
  flexOne: { flex: 1 },
  searchInput: { minWidth: 160 },
  cardGrid: { gap: 14 },
  itemCard: { borderRadius: 22, overflow: "hidden", backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)" },
  itemImage: { width: "100%", height: 220 },
  itemBody: { padding: 16, gap: 10 },
  spaceBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  itemName: { fontSize: 20, fontWeight: "700", color: "#251d18" },
  itemNotes: { color: "#6d6259", lineHeight: 20 },
  smallText: { color: "#6d6259", lineHeight: 20 },
  emptyText: { color: "#6d6259", textAlign: "center", paddingVertical: 12 },
  shareCode: { fontSize: 24, fontWeight: "700", color: "#251d18", letterSpacing: 1 },
  memberCard: { padding: 14, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  memberName: { fontSize: 18, fontWeight: "700", color: "#251d18" },
  tryOnStage: { minHeight: 420, borderRadius: 22, backgroundColor: "#f6eee6", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative", padding: 20 },
  tryOnAvatar: { width: "100%", maxWidth: 320, height: 380, borderRadius: 22 },
  tryOnPlaceholder: { width: "100%", maxWidth: 320, height: 380, borderRadius: 22, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(31,26,23,0.14)", alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  tryOnGarment: { position: "absolute", top: 110, width: 180, height: 220, borderRadius: 18, opacity: 0.95 },
  tryOnGarmentFallback: { backgroundColor: "rgba(200,92,45,0.2)", alignItems: "center", justifyContent: "center", padding: 12 },
  historyCard: { padding: 14, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(31,26,23,0.08)", gap: 8 },
});

export default App;
