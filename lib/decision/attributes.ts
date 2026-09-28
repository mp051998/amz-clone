/**
 * Per-category decision configuration: the five attributes a shopper can weigh,
 * named weight presets, the "Tune my priorities" quiz, category/use-case
 * vocabulary for the query parser, and store-aware budget ranges.
 *
 * Pure data + pure helpers, safe on the client. Only `import type` statements
 * are allowed here: scripts/build-insights.mjs imports this file directly with
 * Node's type stripping, so it must not pull in runtime modules.
 */
import type { Market } from '../types';
import type {
  Attribute,
  CategoryDecisionConfig,
  Preset,
  QuizAnswers,
  QuizQuestion,
  Weights,
} from './types';

/** An attribute plus the copy and scoring signals the rules engine needs. */
export interface AttributeSpec extends Attribute {
  /** why() line for a 5/5 score: "Excellent sound". */
  strong: string;
  /** why() line for a 4/5 score: "Great sound". */
  good: string;
  /** warn()/cons line when the product is weak here: "Average battery life". */
  weak: string;
  /** Quiz "what's annoyed you before?" option for this attribute. */
  pain: string;
  /** Reason shown when that pain option was picked. */
  painReason: string;
  /**
   * Keyword signals for the rules insight builder: [regex source (case-insensitive), score delta].
   * Matched against title + bullets.
   */
  signals: [string, number][];
  /** Optional concrete why() line pulled from the title: regex source + `$1` template. */
  detail?: { pattern: string; template: string };
}

/** A preset plus the vocabulary that selects it from a query and its "Best for" phrase. */
export interface PresetSpec extends Preset {
  /** Lower-case words/phrases that imply this preset in a search query. */
  keywords: string[];
  /** "Best for" copy for products that fit this preset best. */
  bestFor: string;
}

/** A quiz option and how it moves the weights. */
export interface QuizOption {
  label: string;
  /** attribute key → weight delta */
  boosts: Weights;
  /** Reason attached to the most-boosted attribute. */
  reason: string;
  /** Optional caution surfaced as the profile's `watch` line. */
  watch?: string;
}

export interface CategorySpec extends CategoryDecisionConfig {
  attributes: AttributeSpec[];
  presets: PresetSpec[];
  /** Display name for sentences ("headphones & audio"). */
  noun: string;
  /** Title-case noun for result headlines ("Headphones & audio"). */
  headline: string;
  /** Lower-case words that identify this category in a query (longest match wins). */
  synonyms: string[];
  uses: { title: string; sub: string; options: QuizOption[] };
  duration: { title: string; sub: string; options: QuizOption[] };
}

// ── helpers for building specs ──────────────────────────────────────────────

const VALUE_ATTR: AttributeSpec = {
  key: 'value',
  label: 'Value for money',
  phrase: 'value for money',
  strong: 'Outstanding value',
  good: 'Great value for the price',
  weak: 'Pricier than similar picks',
  pain: 'Paying more than it was worth',
  painReason: "You've overpaid before, so price counts for more",
  signals: [['\\bvalue\\b|\\bbasics\\b|budget|affordable', 1]],
};

const w = (entries: Record<string, number>): Weights => ({ ...entries });

// ── categories ──────────────────────────────────────────────────────────────

const ELECTRONICS: CategorySpec = {
  category: 'electronics',
  noun: 'headphones & audio',
  headline: 'Headphones & audio',
  synonyms: [
    'electronics', 'headphones', 'headphone', 'earbuds', 'earbud', 'earphones', 'headset', 'audio', 'speaker',
    'smartwatch', 'smart watch', 'watch', 'tws', 'airdopes', 'buds', 'bluetooth',
  ],
  attributes: [
    {
      key: 'sound', label: 'Sound quality', phrase: 'sound quality',
      strong: 'Excellent sound', good: 'Great sound', weak: 'Average sound quality',
      pain: 'Flat or muddy sound', painReason: 'Muddy sound has let you down before',
      signals: [['hi-?res|hifi|hi-fi|stereo|bass|drivers|bionic|sony|soundcore|samsung', 1], ['\\bmini\\b|seniors|tv headphones', -1]],
    },
    {
      key: 'battery', label: 'Battery life', phrase: 'battery life',
      strong: 'Exceptional battery life', good: 'Long battery life', weak: 'Shorter battery life',
      pain: 'Charging too often', painReason: 'Frequent charging has annoyed you',
      signals: [['\\b(?:[89]\\d|1\\d\\d)\\s*h(?:rs|ours)?\\b', 2], ['\\b(?:[4-7]\\d)\\s*h(?:rs|ours)?\\b', 1], ['\\b(?:[1-2]\\d)\\s*h(?:rs|ours)?\\b', -1]],
      detail: { pattern: '\\b(\\d{2,3})\\s*h(?:rs|ours)?\\b', template: '$1h battery' },
    },
    {
      key: 'comfort', label: 'Comfort', phrase: 'comfort',
      strong: 'All-day comfort', good: 'Comfortable fit', weak: 'Can feel tight on long wear',
      pain: 'Sore ears or headaches', painReason: 'Past headphones gave you sore ears',
      signals: [['memory-foam|lightweight|comfortable|cushion|on-ear|half in-ear', 1], ['sports|gym', 0]],
    },
    {
      key: 'anc', label: 'Noise cancellation', phrase: 'noise cancellation',
      strong: 'Excellent noise cancellation', good: 'Good noise cancellation', weak: 'Limited noise cancellation',
      pain: 'Background noise leaking in', painReason: 'Noise leaking in has bothered you before',
      signals: [['noise cancell?ing|\\banc\\b', 2], ['hybrid|adaptive|\\d{2}\\s*db', 1], ['\\benc\\b', 0]],
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'travel', label: 'Travel', weights: w({ sound: 3, battery: 4, comfort: 4, anc: 5, value: 2 }), keywords: ['travel', 'flight', 'flights', 'trip', 'commute', 'commuting', 'plane'], bestFor: 'Commuting & travel' },
    { id: 'work', label: 'Work & calls', weights: w({ sound: 3, battery: 3, comfort: 5, anc: 4, value: 2 }), keywords: ['work', 'office', 'wfh', 'calls', 'meetings', 'zoom'], bestFor: 'Work & calls' },
    { id: 'fitness', label: 'Workouts', weights: w({ sound: 3, battery: 4, comfort: 4, anc: 1, value: 3 }), keywords: ['gym', 'workout', 'running', 'run', 'sports', 'fitness'], bestFor: 'Workouts & outdoors' },
    { id: 'sound', label: 'Best sound', weights: w({ sound: 5, battery: 2, comfort: 3, anc: 2, value: 2 }), keywords: ['music', 'audiophile', 'bass', 'sound'], bestFor: 'Music lovers' },
    { id: 'value', label: 'Best value', weights: w({ sound: 3, battery: 3, comfort: 3, anc: 2, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Getting the most for less' },
  ],
  defaultWeights: w({ sound: 3, battery: 3, comfort: 3, anc: 3, value: 3 }),
  uses: {
    title: 'Where will you use them most?', sub: 'Pick all that apply.',
    options: [
      { label: 'Flights & long trips', boosts: { anc: 2, battery: 1 }, reason: 'Cabin noise is the biggest issue on flights' },
      { label: 'Daily commute', boosts: { anc: 1, battery: 1 }, reason: 'Blocks out traffic and train noise' },
      { label: 'Home office & calls', boosts: { comfort: 1, anc: 1 }, reason: 'You wear them through long workdays', watch: 'You take calls on them, so check microphone reviews before you buy.' },
      { label: 'Gym & outdoors', boosts: { battery: 1, anc: -1 }, reason: 'Workouts need a secure fit and long battery' },
      { label: 'Music at home', boosts: { sound: 2 }, reason: 'Listening at home puts sound first' },
    ],
  },
  duration: {
    title: 'How long do you usually wear them at a stretch?', sub: 'Comfort matters more the longer you wear them.',
    options: [
      { label: 'Under an hour', boosts: { comfort: -1 }, reason: 'Short sessions, so fit matters less' },
      { label: '1–3 hours', boosts: {}, reason: '' },
      { label: '3+ hours', boosts: { comfort: 2, battery: 1 }, reason: 'Wearing them 3+ hours makes comfort critical' },
    ],
  },
};

const COMPUTERS: CategorySpec = {
  category: 'computers',
  noun: 'laptops',
  headline: 'Laptops',
  synonyms: ['computers', 'computer', 'laptop', 'laptops', 'notebook', 'macbook', 'chromebook', 'pc', 'ultrabook'],
  attributes: [
    {
      key: 'performance', label: 'Performance', phrase: 'performance',
      strong: 'Fast for heavy work', good: 'Snappy everyday performance', weak: 'Modest performance for heavy apps',
      pain: 'Slow when I open lots of apps', painReason: 'Lag with many apps open has frustrated you',
      signals: [['core ultra|core i7|ryzen 7|i7|16gb|32gb|m[34]\\b', 2], ['core i5|ryzen 5|i5|ddr5', 1], ['celeron|8gb|ryzen 3|pentium', -1]],
      detail: { pattern: '\\b(16|32)\\s*GB\\s*(?:RAM|DDR5|LPDDR5)?', template: '$1GB RAM' },
    },
    {
      key: 'battery', label: 'Battery life', phrase: 'battery life',
      strong: 'All-day-plus battery', good: 'All-day battery', weak: 'Needs the charger by evening',
      pain: 'Hunting for a charger', painReason: 'Running out of battery has caught you out',
      signals: [['all-day battery|battery life', 0], ['ultra|xps|thin', 1], ['gaming', -1]],
    },
    {
      key: 'display', label: 'Display', phrase: 'display',
      strong: 'Stunning display', good: 'Crisp Full-HD display', weak: 'Basic display',
      pain: 'Dim or grainy screen', painReason: 'A poor screen has strained your eyes before',
      signals: [['oled|wuxga|2\\.8k|3k|\\b120hz', 2], ['fhd|full-hd|anti-glare', 0]],
    },
    {
      key: 'portability', label: 'Portability', phrase: 'portability',
      strong: 'Ultra-portable', good: 'Easy to carry', weak: 'Heavier to carry around',
      pain: 'Too heavy to carry', painReason: "You've found laptops a pain to carry",
      signals: [['\\b1[34](?:\\.\\d)?"|thin|light|ultra', 1], ['\\b1[67](?:\\.\\d)?"|gaming', -1]],
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'work', label: 'Work', weights: w({ performance: 4, battery: 4, display: 3, portability: 3, value: 2 }), keywords: ['work', 'office', 'business', 'wfh'], bestFor: 'Work & productivity' },
    { id: 'study', label: 'Study', weights: w({ performance: 3, battery: 4, display: 3, portability: 4, value: 4 }), keywords: ['study', 'student', 'students', 'college', 'school'], bestFor: 'Students' },
    { id: 'creative', label: 'Creative work', weights: w({ performance: 5, battery: 2, display: 5, portability: 2, value: 1 }), keywords: ['editing', 'design', 'creative', 'video', 'photo', 'gaming'], bestFor: 'Creative & heavy work' },
    { id: 'travel', label: 'On the go', weights: w({ performance: 3, battery: 5, display: 3, portability: 5, value: 2 }), keywords: ['travel', 'portable', 'lightweight', 'commute'], bestFor: 'Working on the go' },
    { id: 'value', label: 'Best value', weights: w({ performance: 3, battery: 3, display: 2, portability: 2, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Everyday use on a budget' },
  ],
  defaultWeights: w({ performance: 3, battery: 3, display: 3, portability: 3, value: 3 }),
  uses: {
    title: 'What will you mostly use it for?', sub: 'Pick all that apply.',
    options: [
      { label: 'Office work & email', boosts: { battery: 1, portability: 1 }, reason: 'Workdays call for a battery that lasts' },
      { label: 'Studying', boosts: { value: 1, portability: 1 }, reason: 'Carried to class, so weight matters' },
      { label: 'Photo or video editing', boosts: { performance: 2, display: 2 }, reason: 'Editing needs power and an accurate screen' },
      { label: 'Streaming & browsing', boosts: { display: 1 }, reason: 'A good screen makes streaming nicer' },
      { label: 'Gaming', boosts: { performance: 2, portability: -1 }, reason: 'Games lean hard on performance' },
    ],
  },
  duration: {
    title: 'How many hours a day will you use it?', sub: 'Longer days need more battery.',
    options: [
      { label: 'Under 2 hours', boosts: { battery: -1 }, reason: 'Short sessions, so battery matters less' },
      { label: '2–6 hours', boosts: {}, reason: '' },
      { label: '6+ hours', boosts: { battery: 2 }, reason: 'Long days need a battery that keeps up' },
    ],
  },
};

const MOBILES: CategorySpec = {
  category: 'mobiles',
  noun: 'phones',
  headline: 'Phones',
  synonyms: ['mobiles', 'mobile', 'phone', 'phones', 'smartphone', 'smartphones', 'iphone', 'galaxy', 'redmi', 'oneplus', '5g phone'],
  attributes: [
    {
      key: 'performance', label: 'Performance', phrase: 'performance',
      strong: 'Flagship-level speed', good: 'Smooth, lag-free performance', weak: 'Slower with heavy apps',
      pain: 'Lag and stutters', painReason: 'A laggy phone has frustrated you',
      signals: [['12gb|16gb|snapdragon 8|dimensity 9|a1[78]', 2], ['8gb', 1], ['4gb|6gb', -1]],
      detail: { pattern: '\\b(\\d{1,2})\\s*GB RAM', template: '$1GB RAM' },
    },
    {
      key: 'battery', label: 'Battery life', phrase: 'battery life',
      strong: 'Two-day battery', good: 'All-day battery', weak: 'Average battery life',
      pain: 'Charging twice a day', painReason: 'Charging too often has annoyed you',
      signals: [['[6-7]\\d{3}\\s*mah', 2], ['5\\d{3}\\s*mah', 1]],
      detail: { pattern: '\\b(\\d{4})\\s*mAh', template: '$1mAh battery' },
    },
    {
      key: 'camera', label: 'Camera', phrase: 'camera',
      strong: 'Excellent camera', good: 'Sharp camera', weak: 'Average low-light photos',
      pain: 'Blurry photos', painReason: 'Disappointing photos have let you down',
      signals: [['\\b(?:50|64|108|200)\\s*mp|\\bois\\b|pro\\b', 1]],
      detail: { pattern: '\\b(\\d{2,3})\\s*MP', template: '$1MP camera' },
    },
    {
      key: 'display', label: 'Display', phrase: 'display',
      strong: 'Stunning display', good: 'Big, bright display', weak: 'Basic display',
      pain: 'Hard to read in sunlight', painReason: "You've struggled with a dim screen",
      signals: [['amoled|oled|120hz|gorilla', 1]],
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'camera', label: 'Camera first', weights: w({ performance: 3, battery: 3, camera: 5, display: 4, value: 2 }), keywords: ['camera', 'photos', 'photography', 'selfie'], bestFor: 'Photos & video' },
    { id: 'gaming', label: 'Gaming', weights: w({ performance: 5, battery: 4, camera: 2, display: 4, value: 2 }), keywords: ['gaming', 'games', 'bgmi', 'pubg'], bestFor: 'Mobile gaming' },
    { id: 'battery', label: 'Long battery', weights: w({ performance: 3, battery: 5, camera: 2, display: 3, value: 3 }), keywords: ['battery', 'long lasting'], bestFor: 'Heavy all-day use' },
    { id: 'everyday', label: 'Everyday', weights: w({ performance: 3, battery: 4, camera: 3, display: 3, value: 4 }), keywords: ['everyday', 'parents', 'daily', 'basic'], bestFor: 'Everyday use' },
    { id: 'value', label: 'Best value', weights: w({ performance: 3, battery: 3, camera: 2, display: 2, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Getting the most for less' },
  ],
  defaultWeights: w({ performance: 3, battery: 3, camera: 3, display: 3, value: 3 }),
  uses: {
    title: 'What do you use your phone for most?', sub: 'Pick all that apply.',
    options: [
      { label: 'Photos & video', boosts: { camera: 2 }, reason: 'You shoot a lot, so the camera leads' },
      { label: 'Gaming', boosts: { performance: 2, display: 1 }, reason: 'Games need a fast chip and a smooth screen' },
      { label: 'Streaming & social', boosts: { display: 1, battery: 1 }, reason: 'Hours of scrolling need screen and battery' },
      { label: 'Calls & messaging', boosts: { battery: 1 }, reason: 'Staying reachable means battery first' },
      { label: 'Work apps', boosts: { performance: 1, battery: 1 }, reason: 'Work apps need speed that lasts all day' },
    ],
  },
  duration: {
    title: 'How long do you keep a phone?', sub: 'Longer means paying for headroom.',
    options: [
      { label: 'About a year', boosts: { value: 1 }, reason: 'Upgrading often, so value counts' },
      { label: '2–3 years', boosts: {}, reason: '' },
      { label: '4+ years', boosts: { performance: 2 }, reason: 'Keeping it for years needs performance headroom' },
    ],
  },
};

const HOME_KITCHEN: CategorySpec = {
  category: 'home-kitchen',
  noun: 'kitchenware',
  headline: 'Kitchenware',
  synonyms: [
    'home-kitchen', 'home & kitchen', 'kitchen', 'cookware', 'pots', 'pans', 'pots and pans', 'frying pan', 'cooker',
    'pressure cooker', 'mixer', 'grinder', 'mixer grinder', 'blender', 'nonstick',
  ],
  attributes: [
    {
      key: 'cooking', label: 'Cooking performance', phrase: 'cooking performance',
      strong: 'Excellent, even heating', good: 'Cooks evenly', weak: 'Uneven heating reported',
      pain: 'Food burning or cooking unevenly', painReason: 'Hot spots have ruined meals before',
      signals: [['even heat|aluminum core|tri-ply|hard anodi[sz]ed|1000w|750w|stone pound', 1], ['500w', -1]],
    },
    {
      key: 'durability', label: 'Durability', phrase: 'durability',
      strong: 'Built to last', good: 'Sturdy build', weak: 'Coating may wear over time',
      pain: 'Things wearing out quickly', painReason: 'Kitchenware wearing out fast has annoyed you',
      signals: [['stainless|hard anodi[sz]ed|isi|warranty|double ball bearing|titanium|diamond', 1]],
    },
    {
      key: 'cleanup', label: 'Easy cleanup', phrase: 'easy cleanup',
      strong: 'Cleans in seconds', good: 'Easy to clean', weak: 'Takes effort to clean',
      pain: 'Scrubbing after every meal', painReason: 'Hard-to-clean pans have been a chore',
      signals: [['nonstick|non stick|non-stick|dishwasher|ceramic', 1], ['stainless steel pots', -1]],
    },
    {
      key: 'capacity', label: 'Set size & capacity', phrase: 'capacity',
      strong: 'Covers every cooking need', good: 'Generous set size', weak: 'Small for family cooking',
      pain: 'Not enough pieces or space', painReason: 'Running out of pots mid-cook has frustrated you',
      signals: [['\\b(?:1[7-9]|2\\d|3\\d)\\s*(?:pcs|pc|piece)|4 jars|3 litre|5 litre|combo', 1], ['1\\.5 litre|\\b[6-8]\\s*-?piece|2 litre', -1]],
      detail: { pattern: '\\b(\\d{1,2})\\s*-?(?:pcs|pc|piece)', template: '$1-piece set' },
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'everyday', label: 'Everyday cooking', weights: w({ cooking: 4, durability: 4, cleanup: 4, capacity: 3, value: 3 }), keywords: ['everyday', 'daily', 'home'], bestFor: 'Everyday home cooking' },
    { id: 'family', label: 'Big family', weights: w({ cooking: 4, durability: 4, cleanup: 3, capacity: 5, value: 2 }), keywords: ['family', 'large', 'big'], bestFor: 'Cooking for a family' },
    { id: 'easy', label: 'Easy care', weights: w({ cooking: 3, durability: 3, cleanup: 5, capacity: 2, value: 3 }), keywords: ['easy', 'dishwasher', 'nonstick', 'beginner'], bestFor: 'Low-effort cleanup' },
    { id: 'value', label: 'Best value', weights: w({ cooking: 3, durability: 3, cleanup: 3, capacity: 2, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Getting the most for less' },
  ],
  defaultWeights: w({ cooking: 3, durability: 3, cleanup: 3, capacity: 3, value: 3 }),
  uses: {
    title: 'What kind of cooking do you do?', sub: 'Pick all that apply.',
    options: [
      { label: 'Quick weekday meals', boosts: { cleanup: 2 }, reason: 'Busy weeknights call for fast cleanup' },
      { label: 'Cooking for a family', boosts: { capacity: 2 }, reason: 'Bigger batches need more capacity' },
      { label: 'Slow, elaborate recipes', boosts: { cooking: 2 }, reason: 'Long recipes need even heat' },
      { label: 'Setting up a new home', boosts: { capacity: 1, value: 1 }, reason: 'A complete set covers a new kitchen' },
    ],
  },
  duration: {
    title: 'How often do you cook?', sub: 'Heavier use needs tougher gear.',
    options: [
      { label: 'A few times a week', boosts: { durability: -1 }, reason: 'Light use, so durability matters less' },
      { label: 'Once a day', boosts: {}, reason: '' },
      { label: 'Several times a day', boosts: { durability: 2 }, reason: 'Daily heavy use makes durability critical' },
    ],
  },
};

const FASHION: CategorySpec = {
  category: 'fashion',
  noun: 'shoes & clothing',
  headline: 'Shoes & clothing',
  synonyms: ['fashion', 'shoes', 'shoe', 'sneakers', 'sneaker', 'running shoes', 'trainers', 't-shirt', 'tshirt', 't-shirts', 'tee', 'polo', 'clothing', 'apparel'],
  attributes: [
    {
      key: 'comfort', label: 'Comfort', phrase: 'comfort',
      strong: 'Cloud-like comfort', good: 'Comfortable all day', weak: 'Firm feel out of the box',
      pain: 'Sore feet or chafing', painReason: 'Uncomfortable pairs have hurt before',
      signals: [['cushion|gel|fresh foam|bondi|soft|cotton', 1]],
    },
    {
      key: 'fit', label: 'Fit & support', phrase: 'fit',
      strong: 'Locked-in, supportive fit', good: 'Secure fit', weak: 'Runs slightly small or large',
      pain: 'Poor fit or support', painReason: 'A sloppy fit has let you down',
      signals: [['supportive|gts|padded collar|locked-in|regular fit|stretch', 1], ['oversized|pull-on|slip-on', -1]],
    },
    {
      key: 'durability', label: 'Durability', phrase: 'durability',
      strong: 'Built to last', good: 'Hard-wearing', weak: 'Shows wear sooner',
      pain: 'Wearing out too fast', painReason: 'Things falling apart early has annoyed you',
      signals: [['durab|rubber outsole|anti-skid|anti-stain|trail', 1]],
    },
    {
      key: 'breathability', label: 'Breathability', phrase: 'breathability',
      strong: 'Stays cool and dry', good: 'Breathable', weak: 'Can run warm',
      pain: 'Hot, sweaty feet', painReason: 'Overheating has been a problem',
      signals: [['breathab|mesh|dry-fit|lightweight', 1]],
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'running', label: 'Running', weights: w({ comfort: 5, fit: 4, durability: 3, breathability: 4, value: 2 }), keywords: ['running', 'run', 'marathon', 'jogging'], bestFor: 'Regular runs' },
    { id: 'gym', label: 'Gym', weights: w({ comfort: 4, fit: 5, durability: 4, breathability: 3, value: 2 }), keywords: ['gym', 'training', 'workout'], bestFor: 'Gym & training' },
    { id: 'everyday', label: 'Everyday wear', weights: w({ comfort: 4, fit: 3, durability: 4, breathability: 3, value: 3 }), keywords: ['everyday', 'casual', 'walking', 'daily'], bestFor: 'Everyday wear' },
    { id: 'value', label: 'Best value', weights: w({ comfort: 3, fit: 3, durability: 3, breathability: 2, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Getting the most for less' },
  ],
  defaultWeights: w({ comfort: 3, fit: 3, durability: 3, breathability: 3, value: 3 }),
  uses: {
    title: 'What will you wear them for?', sub: 'Pick all that apply.',
    options: [
      { label: 'Running', boosts: { comfort: 2, breathability: 1 }, reason: 'Miles add up, so cushioning leads' },
      { label: 'Gym & training', boosts: { fit: 2 }, reason: 'Lifts and lateral moves need a locked-in fit' },
      { label: 'Walking & errands', boosts: { comfort: 1, durability: 1 }, reason: 'Daily walking wears pairs down' },
      { label: 'Casual wear', boosts: { value: 1 }, reason: 'Casual pairs should not cost a fortune' },
    ],
  },
  duration: {
    title: 'How many hours a day will you wear them?', sub: 'Comfort matters more the longer you wear them.',
    options: [
      { label: 'Under an hour', boosts: { comfort: -1 }, reason: 'Short wear, so comfort matters less' },
      { label: '1–4 hours', boosts: {}, reason: '' },
      { label: 'All day', boosts: { comfort: 2, breathability: 1 }, reason: 'All-day wear makes comfort critical' },
    ],
  },
};

const BEAUTY: CategorySpec = {
  category: 'beauty',
  noun: 'skincare',
  headline: 'Skincare',
  synonyms: [
    'beauty', 'skincare', 'skin care', 'serum', 'sunscreen', 'spf', 'moisturiser', 'moisturizer', 'face wash',
    'cleanser', 'cream', 'face cream', 'toner',
  ],
  attributes: [
    {
      key: 'gentle', label: 'Gentleness', phrase: 'gentleness',
      strong: 'Very gentle on skin', good: 'Gentle for daily use', weak: 'May sting sensitive skin',
      pain: 'Irritation or breakouts', painReason: 'Products have irritated your skin before',
      signals: [['sensitive|gentle|dermatolog|soap-free|relief|recovery|kids', 1], ['acne|10%|vitamin c', -1]],
    },
    {
      key: 'hydration', label: 'Hydration', phrase: 'hydration',
      strong: 'Deeply hydrating', good: 'Hydrating', weak: 'Light hydration only',
      pain: 'Skin feeling tight or dry', painReason: 'Dryness has been an issue for you',
      signals: [['hydrat|hyaluronic|moistur|water bank|dewy|ceramide|aloe', 1], ['oil control|foaming', -1]],
    },
    {
      key: 'results', label: 'Visible results', phrase: 'visible results',
      strong: 'Noticeable results fast', good: 'Visible glow', weak: 'Results take a while',
      pain: 'Not seeing any difference', painReason: "Products that didn't deliver have disappointed you",
      signals: [['vitamin c|niacinamide|pdrn|brighten|glow|dark spot|spf 50', 1]],
    },
    {
      key: 'clean', label: 'Clean ingredients', phrase: 'clean ingredients',
      strong: 'Clean, minimal formula', good: 'Free from harsh extras', weak: 'Contains fragrance',
      pain: 'Harsh chemicals or fragrance', painReason: 'You avoid harsh ingredients',
      signals: [['paraben|sulfate|sulphate|vegan|non-toxic|fragrance-free|phthalate', 1]],
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'sensitive', label: 'Sensitive skin', weights: w({ gentle: 5, hydration: 4, results: 2, clean: 4, value: 2 }), keywords: ['sensitive', 'gentle', 'redness'], bestFor: 'Sensitive skin' },
    { id: 'glow', label: 'Glow & results', weights: w({ gentle: 2, hydration: 3, results: 5, clean: 2, value: 2 }), keywords: ['glow', 'bright', 'brightening', 'dark spots', 'glass skin'], bestFor: 'Visible glow' },
    { id: 'dry', label: 'Dry skin', weights: w({ gentle: 3, hydration: 5, results: 3, clean: 3, value: 2 }), keywords: ['dry', 'hydrating', 'hydration', 'moisture'], bestFor: 'Dry skin' },
    { id: 'travel', label: 'Travel kit', weights: w({ gentle: 3, hydration: 3, results: 3, clean: 3, value: 4 }), keywords: ['travel', 'mini', 'kit', 'trip'], bestFor: 'Travel & trying new routines' },
    { id: 'value', label: 'Best value', weights: w({ gentle: 3, hydration: 3, results: 3, clean: 2, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Getting the most for less' },
  ],
  defaultWeights: w({ gentle: 3, hydration: 3, results: 3, clean: 3, value: 3 }),
  uses: {
    title: 'What are you hoping it will do?', sub: 'Pick all that apply.',
    options: [
      { label: 'Calm sensitive skin', boosts: { gentle: 2 }, reason: 'Sensitive skin needs a gentle formula' },
      { label: 'Fix dryness', boosts: { hydration: 2 }, reason: 'Dry skin needs lasting hydration' },
      { label: 'Brighten & even tone', boosts: { results: 2 }, reason: 'You want to see a difference' },
      { label: 'Sun protection', boosts: { results: 1, gentle: 1 }, reason: 'Daily SPF has to be comfortable to wear' },
      { label: 'A simple routine', boosts: { value: 1, clean: 1 }, reason: 'Fewer, better products suit you' },
    ],
  },
  duration: {
    title: 'How consistent is your routine?', sub: 'We weigh value and results differently.',
    options: [
      { label: 'Now and then', boosts: { value: 1 }, reason: 'Occasional use, so value matters' },
      { label: 'Most days', boosts: {}, reason: '' },
      { label: 'Twice daily, every day', boosts: { gentle: 1, results: 1 }, reason: 'Daily use needs a formula your skin tolerates' },
    ],
  },
};

const BOOKS: CategorySpec = {
  category: 'books',
  noun: 'books',
  headline: 'Books',
  synonyms: ['books', 'book', 'novel', 'novels', 'thriller', 'fiction', 'nonfiction', 'non-fiction', 'classic', 'paperback', 'hardcover', 'read'],
  attributes: [
    {
      key: 'gripping', label: 'Page-turner', phrase: 'pace',
      strong: 'Impossible to put down', good: 'A real page-turner', weak: 'Slow in places',
      pain: 'Books that drag', painReason: 'Slow books have lost you before',
      signals: [['thriller|addictive|gripping|mystery|suspense', 1], ['classic|war and peace|philosophy', -1]],
    },
    {
      key: 'writing', label: 'Writing quality', phrase: 'writing',
      strong: 'Beautifully written', good: 'Well written', weak: 'Plain prose',
      pain: 'Flat, clumsy writing', painReason: 'Clumsy prose has spoiled books for you',
      signals: [['literary|classic|prize|novel|premium', 1]],
    },
    {
      key: 'depth', label: 'Depth & ideas', phrase: 'depth',
      strong: 'Rich with ideas', good: 'Thought-provoking', weak: 'Light on substance',
      pain: 'Nothing to think about after', painReason: 'You like books that stay with you',
      signals: [['classic|art of|habits|history|philosophy|war and peace', 2], ['book club', 1]],
    },
    {
      key: 'acclaim', label: 'Reader acclaim', phrase: 'reader acclaim',
      strong: 'A reader favourite', good: 'Well reviewed', weak: 'Divided reviews',
      pain: 'Overhyped picks', painReason: 'Hype has let you down, so reviews count',
      signals: [['book club|bestseller|pick|#1', 1]],
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'weekend', label: 'Weekend read', weights: w({ gripping: 5, writing: 3, depth: 2, acclaim: 3, value: 3 }), keywords: ['weekend', 'holiday', 'beach', 'vacation', 'fun'], bestFor: 'A quick weekend read' },
    { id: 'bookclub', label: 'Book club', weights: w({ gripping: 3, writing: 4, depth: 5, acclaim: 4, value: 2 }), keywords: ['book club', 'discussion', 'club'], bestFor: 'Book clubs & discussion' },
    { id: 'gift', label: 'Gift', weights: w({ gripping: 3, writing: 4, depth: 3, acclaim: 5, value: 2 }), keywords: ['gift', 'present', 'birthday'], bestFor: 'Gifting' },
    { id: 'value', label: 'Best value', weights: w({ gripping: 3, writing: 3, depth: 3, acclaim: 3, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Great reads for less' },
  ],
  defaultWeights: w({ gripping: 3, writing: 3, depth: 3, acclaim: 3, value: 3 }),
  uses: {
    title: 'What are you in the mood for?', sub: 'Pick all that apply.',
    options: [
      { label: 'Something I cannot put down', boosts: { gripping: 2 }, reason: 'You want momentum from page one' },
      { label: 'Something to think about', boosts: { depth: 2 }, reason: 'You like ideas that stay with you' },
      { label: 'Beautiful writing', boosts: { writing: 2 }, reason: 'The prose itself matters to you' },
      { label: 'A gift for someone', boosts: { acclaim: 2 }, reason: 'A safe, well-loved pick makes a good gift' },
    ],
  },
  duration: {
    title: 'How much do you read in a week?', sub: 'Heavy readers can take on longer books.',
    options: [
      { label: 'An hour or two', boosts: { gripping: 1 }, reason: 'Short sessions need a book that pulls you back' },
      { label: 'A few hours', boosts: {}, reason: '' },
      { label: 'Every spare minute', boosts: { depth: 1 }, reason: 'You have time for something substantial' },
    ],
  },
};

const TOYS: CategorySpec = {
  category: 'toys',
  noun: 'toys',
  headline: 'Toys',
  synonyms: ['toys', 'toy', 'toys & games', 'kids', 'blocks', 'building blocks', 'puzzle', 'puzzles', 'play set', 'playset', 'montessori', 'stem', 'lego'],
  attributes: [
    {
      key: 'learning', label: 'Learning value', phrase: 'learning value',
      strong: 'Packed with learning', good: 'Builds skills', weak: 'More play than learning',
      pain: 'Toys with no learning value', painReason: 'You want play that teaches something',
      signals: [['learning|educational|stem|montessori|abc|alphabet|microscope|brain|flash cards', 1], ['squish|fidget|party favors', -1]],
    },
    {
      key: 'fun', label: 'Fun factor', phrase: 'fun',
      strong: 'Kids love it', good: 'Loads of fun', weak: 'May not hold attention long',
      pain: 'Ignored after a day', painReason: 'Toys that got ignored have been a waste',
      signals: [['fun|play|camera|drone|rc|piano|active|projector|magnetic', 1]],
    },
    {
      key: 'durability', label: 'Durability', phrase: 'durability',
      strong: 'Built to survive anything', good: 'Sturdy build', weak: 'Parts can break with rough play',
      pain: 'Breaking quickly', painReason: 'Toys breaking fast has been frustrating',
      signals: [['wooden|durable|kid-safe|sturdy', 1], ['squish|mini drone|helicopter', -1]],
    },
    {
      key: 'safety', label: 'Safety', phrase: 'safety',
      strong: 'Very safe for little ones', good: 'Kid-safe materials', weak: 'Small parts — check the age range',
      pain: 'Small parts or sharp edges', painReason: 'Safety worries have put you off toys before',
      signals: [['kid-safe|non-toxic|toddler|baby|wooden', 1], ['small parts|160 pcs|150-pack|30 pack', -1]],
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'learning', label: 'Learning', weights: w({ learning: 5, fun: 3, durability: 3, safety: 4, value: 2 }), keywords: ['learning', 'educational', 'stem', 'montessori'], bestFor: 'Learning through play' },
    { id: 'gift', label: 'Gift', weights: w({ learning: 3, fun: 5, durability: 3, safety: 3, value: 2 }), keywords: ['gift', 'birthday', 'present', 'christmas', 'diwali'], bestFor: 'Birthday gifts' },
    { id: 'toddler', label: 'Toddlers', weights: w({ learning: 3, fun: 3, durability: 4, safety: 5, value: 2 }), keywords: ['toddler', 'toddlers', 'baby', '1 year', '2 year'], bestFor: 'Toddlers' },
    { id: 'party', label: 'Party favours', weights: w({ learning: 1, fun: 4, durability: 2, safety: 3, value: 5 }), keywords: ['party', 'favors', 'favours', 'return gift', 'bulk'], bestFor: 'Party bags & return gifts' },
    { id: 'value', label: 'Best value', weights: w({ learning: 3, fun: 3, durability: 3, safety: 3, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Getting the most for less' },
  ],
  defaultWeights: w({ learning: 3, fun: 3, durability: 3, safety: 3, value: 3 }),
  uses: {
    title: 'Who is it for?', sub: 'Pick all that apply.',
    options: [
      { label: 'A toddler (1–3)', boosts: { safety: 2, durability: 1 }, reason: 'Little hands need safe, tough toys' },
      { label: 'A preschooler (3–5)', boosts: { learning: 1, fun: 1 }, reason: 'Preschoolers learn fastest through play' },
      { label: 'An older kid (6+)', boosts: { fun: 2 }, reason: 'Older kids need something genuinely fun' },
      { label: 'A party or group', boosts: { value: 2 }, reason: 'Buying several makes price matter more' },
    ],
  },
  duration: {
    title: 'How long should it keep them busy?', sub: 'We favour lasting toys when it matters.',
    options: [
      { label: 'A one-off treat', boosts: { durability: -1 }, reason: 'A treat does not need to last years' },
      { label: 'A few months', boosts: {}, reason: '' },
      { label: 'Years — pass it down', boosts: { durability: 2 }, reason: 'Toys you keep for years need to be tough' },
    ],
  },
};

const SPORTS: CategorySpec = {
  category: 'sports',
  noun: 'fitness gear',
  headline: 'Fitness gear',
  synonyms: ['sports', 'sports & outdoors', 'dumbbell', 'dumbbells', 'weights', 'kettlebell', 'barbell', 'yoga mat', 'yoga', 'mat', 'home gym', 'fitness equipment'],
  attributes: [
    {
      key: 'versatility', label: 'Weight range', phrase: 'weight range',
      strong: 'Replaces a full rack', good: 'Wide weight range', weak: 'Limited weight range',
      pain: 'Outgrowing my weights', painReason: "You've outgrown equipment before",
      signals: [['adjustable|5-in-1|6-in-1|3-in-1|90\\s?lbs|24\\s?kg|multi', 1], ['single|2\\.5 kg|3 kg x 2|4mm', -1]],
      detail: { pattern: '\\b(\\d{2,3})\\s?(lbs?|kg)\\b', template: 'Up to $1 $2' },
    },
    {
      key: 'build', label: 'Build quality', phrase: 'build quality',
      strong: 'Gym-grade build', good: 'Solid build', weak: 'Lighter-duty build',
      pain: 'Wobbly or cheap-feeling', painReason: 'Flimsy gear has felt unsafe',
      signals: [['iron|rubber|steel|professional|powerblock|elite|high-density', 1], ['pvc', -1]],
    },
    {
      key: 'grip', label: 'Grip & comfort', phrase: 'grip',
      strong: 'Excellent grip', good: 'Comfortable, non-slip grip', weak: 'Grip can feel slippery',
      pain: 'Slipping or sore hands', painReason: 'A poor grip has bothered you',
      signals: [['non-slip|anti-slip|grip|strap|tpe', 1]],
    },
    {
      key: 'compact', label: 'Space-saving', phrase: 'space-saving design',
      strong: 'Tiny footprint', good: 'Space-saving', weak: 'Takes up floor space',
      pain: 'No room at home', painReason: 'Space at home is tight',
      signals: [['space-saving|adjustable|foldable|compact|quick-adjust', 1], ['combo|kit|rods', -1]],
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'homegym', label: 'Home gym', weights: w({ versatility: 5, build: 4, grip: 3, compact: 3, value: 2 }), keywords: ['home gym', 'strength', 'muscle', 'lifting'], bestFor: 'Building a home gym' },
    { id: 'beginner', label: 'Beginner', weights: w({ versatility: 3, build: 3, grip: 4, compact: 3, value: 4 }), keywords: ['beginner', 'beginners', 'starter', 'women'], bestFor: 'Getting started' },
    { id: 'small', label: 'Small spaces', weights: w({ versatility: 3, build: 3, grip: 3, compact: 5, value: 3 }), keywords: ['apartment', 'small', 'compact', 'space'], bestFor: 'Small apartments' },
    { id: 'value', label: 'Best value', weights: w({ versatility: 3, build: 3, grip: 3, compact: 2, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Getting the most for less' },
  ],
  defaultWeights: w({ versatility: 3, build: 3, grip: 3, compact: 3, value: 3 }),
  uses: {
    title: 'What are your goals?', sub: 'Pick all that apply.',
    options: [
      { label: 'Build strength', boosts: { versatility: 2, build: 1 }, reason: 'Progressing needs heavier, sturdier gear' },
      { label: 'Tone & stay active', boosts: { grip: 1, value: 1 }, reason: 'Lighter, comfortable gear suits toning' },
      { label: 'Yoga & stretching', boosts: { grip: 2 }, reason: 'Stretching needs a grip that stays put' },
      { label: 'Train in a small space', boosts: { compact: 2 }, reason: 'Limited space means compact gear' },
    ],
  },
  duration: {
    title: 'How often will you train?', sub: 'Frequent training needs tougher gear.',
    options: [
      { label: 'Once a week or less', boosts: { value: 1 }, reason: 'Occasional use, so value matters' },
      { label: '2–4 times a week', boosts: {}, reason: '' },
      { label: 'Almost every day', boosts: { build: 2 }, reason: 'Daily training makes build quality critical' },
    ],
  },
};

/** Fallback for any category without a dedicated config. */
export const GENERIC_CONFIG: CategorySpec = {
  category: 'generic',
  noun: 'products',
  headline: 'Results',
  synonyms: [],
  attributes: [
    {
      key: 'quality', label: 'Quality', phrase: 'quality',
      strong: 'Excellent quality', good: 'Well made', weak: 'Average build quality',
      pain: 'Cheap-feeling products', painReason: 'Cheap-feeling products have let you down',
      signals: [['premium|professional|pro\\b', 1]],
    },
    {
      key: 'durability', label: 'Durability', phrase: 'durability',
      strong: 'Built to last', good: 'Durable', weak: 'May wear sooner',
      pain: 'Things breaking early', painReason: 'Things breaking early has annoyed you',
      signals: [['durab|sturdy|warranty', 1]],
    },
    {
      key: 'ease', label: 'Ease of use', phrase: 'ease of use',
      strong: 'Effortless to use', good: 'Easy to use', weak: 'Takes some getting used to',
      pain: 'Fiddly to use', painReason: 'Fiddly products have frustrated you',
      signals: [['easy|simple|quick', 1]],
    },
    {
      key: 'reviews', label: 'Owner satisfaction', phrase: 'owner satisfaction',
      strong: 'Owners love it', good: 'Owners are happy', weak: 'Mixed owner reviews',
      pain: 'Surprises after buying', painReason: 'You rely on what owners say',
      signals: [],
    },
    VALUE_ATTR,
  ],
  presets: [
    { id: 'quality', label: 'Best quality', weights: w({ quality: 5, durability: 4, ease: 3, reviews: 4, value: 1 }), keywords: ['best', 'premium', 'quality'], bestFor: 'Buying once, buying well' },
    { id: 'popular', label: 'Most loved', weights: w({ quality: 3, durability: 3, ease: 3, reviews: 5, value: 2 }), keywords: ['popular', 'top rated', 'loved'], bestFor: 'A safe, popular pick' },
    { id: 'value', label: 'Best value', weights: w({ quality: 3, durability: 3, ease: 3, reviews: 3, value: 5 }), keywords: ['cheap', 'budget', 'affordable', 'value'], bestFor: 'Getting the most for less' },
  ],
  defaultWeights: w({ quality: 3, durability: 3, ease: 3, reviews: 3, value: 3 }),
  uses: {
    title: 'What matters most for this purchase?', sub: 'Pick all that apply.',
    options: [
      { label: 'It has to last', boosts: { durability: 2 }, reason: 'You want something that lasts' },
      { label: 'Simple to use', boosts: { ease: 2 }, reason: 'You want it to just work' },
      { label: 'A safe, popular pick', boosts: { reviews: 2 }, reason: "Other owners' experience matters to you" },
      { label: 'A gift', boosts: { quality: 1, reviews: 1 }, reason: 'A gift should feel well made' },
    ],
  },
  duration: {
    title: 'How often will you use it?', sub: 'Heavier use needs sturdier picks.',
    options: [
      { label: 'Occasionally', boosts: { value: 1 }, reason: 'Occasional use, so value matters' },
      { label: 'Weekly', boosts: {}, reason: '' },
      { label: 'Every day', boosts: { durability: 2 }, reason: 'Daily use makes durability critical' },
    ],
  },
};

const CONFIGS: Record<string, CategorySpec> = {
  electronics: ELECTRONICS,
  computers: COMPUTERS,
  mobiles: MOBILES,
  'home-kitchen': HOME_KITCHEN,
  fashion: FASHION,
  beauty: BEAUTY,
  books: BOOKS,
  toys: TOYS,
  sports: SPORTS,
};

/** Every category slug with a dedicated config (the generic fallback excluded). */
export const CONFIGURED_CATEGORIES: readonly string[] = Object.keys(CONFIGS);

/** Decision config for a category slug; the generic config for unknown/null slugs. */
export function decisionConfig(category: string | null | undefined): CategorySpec {
  return (category && CONFIGS[category]) || GENERIC_CONFIG;
}

/** Attribute keys for a category, in display order. */
export function attributeKeys(category: string | null | undefined): string[] {
  return decisionConfig(category).attributes.map((a) => a.key);
}

export function findPreset(category: string | null | undefined, presetId: string | null | undefined): PresetSpec | null {
  if (!presetId) return null;
  return decisionConfig(category).presets.find((p) => p.id === presetId) ?? null;
}

/** Weights for a preset, or the category defaults. Always a fresh object. */
export function weightsFor(category: string | null | undefined, presetId?: string | null): Weights {
  const cfg = decisionConfig(category);
  return { ...(findPreset(category, presetId)?.weights ?? cfg.defaultWeights) };
}

/** Clamp a weights object to the category's keys, integers 0..5 (missing keys → default). */
export function clampWeights(category: string | null | undefined, raw: Record<string, unknown> | null | undefined): Weights {
  const cfg = decisionConfig(category);
  const out: Weights = {};
  for (const a of cfg.attributes) {
    const n = Math.round(Number(raw?.[a.key]));
    out[a.key] = Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : cfg.defaultWeights[a.key] ?? 3;
  }
  return out;
}

// ── quiz ────────────────────────────────────────────────────────────────────

export const PRICE_VS_QUALITY = ['Lowest price that does the job', 'A balance of both', 'Best quality — price is secondary'] as const;

/** The five quiz steps for a category (use, duration, priceVsQuality, pain, note). */
export function quizFor(category: string | null | undefined): QuizQuestion[] {
  const cfg = decisionConfig(category);
  return [
    { id: 'use', multi: true, title: cfg.uses.title, sub: cfg.uses.sub, options: cfg.uses.options.map((o) => o.label) },
    { id: 'duration', multi: false, title: cfg.duration.title, sub: cfg.duration.sub, options: cfg.duration.options.map((o) => o.label) },
    {
      id: 'priceVsQuality',
      multi: false,
      title: 'Price or quality — which wins when they clash?',
      sub: 'We use this to weigh value for money.',
      options: [...PRICE_VS_QUALITY],
    },
    {
      id: 'pain',
      multi: true,
      title: `What's annoyed you about ${cfg.noun} before?`,
      sub: 'Pick any that apply, or skip.',
      options: cfg.attributes.map((a) => a.pain),
    },
    { id: 'note', multi: false, title: 'Anything else we should know?', sub: 'Optional. Plain words are fine.', options: [] },
  ];
}

export function emptyQuizAnswers(): QuizAnswers {
  return { use: [], duration: null, priceVsQuality: null, pain: [], note: '' };
}

// ── budgets (store-aware) ───────────────────────────────────────────────────

export interface BudgetRange {
  currency: 'USD' | 'INR';
  minMinor: number;
  maxMinor: number;
  stepMinor: number;
  defaultMinor: number;
}

/** [min, max, step, default] in major units (dollars / rupees). */
type Range = [number, number, number, number];
const BUDGETS: Record<Market, Record<string, Range>> = {
  US: {
    electronics: [10, 300, 5, 150],
    computers: [200, 2000, 50, 800],
    mobiles: [100, 1500, 50, 600],
    'home-kitchen': [20, 400, 10, 200],
    fashion: [20, 250, 5, 120],
    beauty: [10, 120, 5, 60],
    books: [5, 40, 1, 25],
    toys: [10, 100, 5, 50],
    sports: [30, 500, 10, 350],
    generic: [10, 1000, 10, 200],
  },
  IN: {
    electronics: [500, 10_000, 250, 3_000],
    computers: [20_000, 200_000, 5_000, 60_000],
    mobiles: [5_000, 120_000, 1_000, 25_000],
    'home-kitchen': [500, 10_000, 250, 5_000],
    fashion: [300, 3_000, 100, 1_200],
    beauty: [100, 1_500, 50, 600],
    books: [100, 1_000, 50, 500],
    toys: [100, 3_000, 100, 1_000],
    sports: [300, 20_000, 500, 5_000],
    generic: [500, 50_000, 500, 5_000],
  },
};

/** Budget slider range for a store + category, in minor units (cents / paise). */
export function budgetRange(market: Market, category: string | null | undefined): BudgetRange {
  const table = BUDGETS[market] ?? BUDGETS.US;
  const [min, max, step, def] = (category && table[category]) || table.generic;
  return {
    currency: market === 'IN' ? 'INR' : 'USD',
    minMinor: min * 100,
    maxMinor: max * 100,
    stepMinor: step * 100,
    defaultMinor: def * 100,
  };
}

/** Clamp a budget into the slider range, snapped to the step. null stays null. */
export function clampBudget(market: Market, category: string | null | undefined, minor: number | null | undefined): number | null {
  if (minor == null || !Number.isFinite(minor) || minor <= 0) return null;
  const r = budgetRange(market, category);
  const snapped = Math.round(minor / r.stepMinor) * r.stepMinor;
  return Math.min(r.maxMinor, Math.max(r.minMinor, snapped));
}
