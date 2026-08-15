/**
 * The tour advances on real app events, never on a "Next" button. Each step
 * names a real control by data-tour-id and the signal that completes it.
 */
export type TourSignal =
  | "cloth:added"
  | "cloth:opened"
  | "tryon:added"
  | "tryon:studio-open"
  | "tryon:tab-selected"
  | "tryon:tab-wardrobe"
  | "plan:interacted"
  | "chat:opened";

export type TourStep = {
  id: string;
  /** data-tour-id of the real control to spotlight. */
  target: string;
  title: string;
  text: string;
  instruction: string;
  /** Completing signal, or a route the user must reach. */
  signal?: TourSignal;
  route?: string;
  /** Route the step lives on; the tour waits quietly elsewhere. */
  onRoute?: string;
  /** Which "seen" flag this step satisfies, for resume bookkeeping. */
  hint?: "wardrobe" | "tryon" | "plan" | "chat";
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "add-cloth",
    target: "add-piece",
    onRoute: "/",
    title: "Start with a piece you love",
    text: "Tap here to add a photo from your wardrobe.",
    instruction: "Tap Add a piece",
    signal: "cloth:added",
    hint: "wardrobe",
  },
  {
    id: "open-cloth",
    target: "first-cloth",
    onRoute: "/",
    title: "Your wardrobe is growing",
    text: "Tap your piece to see details, edit it, wear it, or style it.",
    instruction: "Tap this piece",
    signal: "cloth:opened",
  },
  {
    id: "add-to-tryon",
    target: "detail-try-on",
    title: "Build a look",
    text: "Add this piece to your virtual Try-on outfit.",
    instruction: "Tap Try on",
    signal: "tryon:added",
  },
  {
    id: "open-studio",
    target: "nav-tryon",
    title: "Your selected look is ready",
    text: "Open Try-on Studio to build your outfit.",
    instruction: "Open Try-on Studio",
    signal: "tryon:studio-open",
    hint: "tryon",
  },
  {
    id: "selected-look",
    target: "tryon-tab-selected",
    onRoute: "/tryon",
    title: "Your selected look",
    text: "Every piece you add for Try-on appears here.",
    instruction: "View selected look",
    signal: "tryon:tab-selected",
  },
  {
    id: "wardrobe-picker",
    target: "tryon-tab-wardrobe",
    onRoute: "/tryon",
    title: "Add more pieces",
    text: "Browse your wardrobe to add a top, bottom, shoes, or accessories.",
    instruction: "Open wardrobe",
    signal: "tryon:tab-wardrobe",
  },
  {
    id: "plan-outfit",
    target: "plan-date",
    onRoute: "/plan",
    title: "Plan ahead",
    text: "Choose a date, select clothes, and save an outfit for later.",
    instruction: "Choose a date or select a piece",
    signal: "plan:interacted",
    hint: "plan",
  },
  {
    id: "ask-ai",
    target: "chat-fab",
    title: "Need an outfit idea?",
    text: "Ask your AI stylist using the clothes in your wardrobe.",
    instruction: "Tap Ask AI",
    signal: "chat:opened",
    hint: "chat",
  },
];
