import { create } from "zustand";

/** Report category, chosen by the menu item that opened the dialog. */
export type FeedbackType = "bug" | "feature" | "other";

interface FeedbackState {
  /** Whether the feedback dialog is open. */
  open: boolean;
  /** Type the dialog should initialise with (from the menu selection). */
  initialType: FeedbackType;
  /** Open the dialog with the given type pre-selected. */
  openWith: (type: FeedbackType) => void;
  /** Close the dialog. */
  close: () => void;
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  open: false,
  initialType: "bug",
  openWith: (type) => set({ open: true, initialType: type }),
  close: () => set({ open: false }),
}));
