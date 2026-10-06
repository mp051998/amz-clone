/**
 * Decision-support contracts shared by the data layer, the AI layer and the UI
 * (docs/superpowers/plans/2026-09-26-decision-store-redesign.md §Contracts).
 * Pure types — no runtime code, safe to import from client components.
 */
import type { Product } from '../types';

/** One axis a shopper can weigh, e.g. `battery` for electronics. Keys are category-scoped. */
export interface Attribute {
  key: string;
  /** Title-case label for chips and tables: "Battery life". */
  label: string;
  /** Lower-case noun phrase for sentences: "battery life". */
  phrase: string;
}

/** A named weight preset ("Travel", "Best value") for one category. */
export interface Preset {
  id: string;
  label: string;
  weights: Weights;
}

/** Attribute key → importance 0..5 (0 = ignore). */
export type Weights = Record<string, number>;

/** Everything the UI needs to rank one category. */
export interface CategoryDecisionConfig {
  category: string;
  attributes: Attribute[];
  presets: Preset[];
  defaultWeights: Weights;
}

/** Stored per product (table `product_insights`). Scores are 1..5 per attribute key. */
export interface ProductInsight {
  productId: string;
  scores: Record<string, number>;
  pros: string[];
  cons: string[];
  bestFor: string;
  /** Review summary paragraph ("AI SUMMARY · FROM 12,482 REVIEWS"). */
  summary: string;
  praised: { theme: string; count: number }[];
  criticized: { theme: string; count: number }[];
  source: 'rules' | 'ai';
  updatedAt: string;
}

/** A product ranked against the viewer's weights. */
export interface RankedProduct {
  product: Product;
  insight: ProductInsight | null;
  /** 0..100 */
  match: number;
  /** Up to 3 short strengths, strongest weighted first ("35h battery"). */
  why: string[];
  /** One trade-off, or null. */
  warn: string | null;
}

/** Chips shown under "We understood:" on search. */
export interface QueryIntent {
  kind: 'category' | 'budget' | 'use' | 'keyword';
  label: string;
  /** Search param this chip maps to (removing the chip clears it). */
  param: string;
  value: string;
  removable: boolean;
}

export interface ParsedQuery {
  /** Keywords left after budget/use phrases are stripped — fed to full-text search. */
  keywords: string;
  category: string | null;
  /** Budget ceiling in minor units, or null. */
  budgetMinor: number | null;
  /** Preset id, or null. */
  use: string | null;
  intents: QueryIntent[];
  /** Headline for results, e.g. "Headphones for travel under ₹10,000". */
  title: string;
  source: 'rules' | 'ai';
}

/** Quiz answers (5 steps). Option labels come from `quizFor(category)`. */
export interface QuizAnswers {
  use: string[];
  duration: string | null;
  priceVsQuality: string | null;
  pain: string[];
  note: string;
}

export interface QuizQuestion {
  id: keyof QuizAnswers;
  multi: boolean;
  title: string;
  sub: string;
  /** Empty for the free-text `note` step. */
  options: string[];
}

export interface PriorityProfile {
  weights: Weights;
  /** attribute key → one short second-person sentence. */
  reasons: Record<string, string>;
  summary: string;
  watch: string;
  source: 'rules' | 'ai';
}

export interface CompareVerdict {
  winnerId: string;
  /** One sentence, e.g. "For travel, the Sennheiser wins on battery and sound…". */
  text: string;
  perProduct: { productId: string; bestFor: string; strengths: string[]; tradeoffs: string[] }[];
  source: 'rules' | 'ai';
}

export interface Collection {
  id: string;
  name: string;
  note: string;
  items: CollectionItem[];
  createdAt: string;
  /**
   * Added by agent A: `considering` = "Things I'm Considering" (the Save button's list),
   * `later` = "Saved for later" (from the cart), `custom` = shopper-made.
   */
  kind?: 'custom' | 'considering' | 'later';
  /** set while the list is shared by link (/lists/<token>) */
  shareToken?: string | null;
}

export interface CollectionItem {
  product: Product;
  /** Price when saved, minor units — drives "↓ ₹800 since you saved". */
  savedPriceMinor: number;
  addedAt: string;
}

/** Order-tracking step, derived from the order (lib/decision/tracking.ts). */
export interface TrackingStep {
  label: string;
  /** ISO time the step happened or is expected. */
  at: string;
  state: 'done' | 'current' | 'upcoming';
}
