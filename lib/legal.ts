/**
 * Content for the footer legal pages (Conditions of Use, Privacy Notice, etc.).
 * All copy is original, written for this portfolio demo — it is illustrative only,
 * not a real legal agreement, and not affiliated with Amazon. The [slug] page adds
 * a demo disclaimer banner above every one of these.
 */
export interface LegalSection {
  heading: string;
  body: string[];
}
export interface LegalPage {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_PAGES: Record<string, LegalPage> = {
  'conditions-of-use': {
    title: 'Conditions of Use & Sale',
    updated: 'September 2026',
    intro:
      'These conditions describe how you may use this demo storefront and what to expect when you browse or place a practice order. By using the site you agree to the points below.',
    sections: [
      {
        heading: 'Using this site',
        body: [
          'This is a non-commercial demo built to showcase a storefront. You may browse, search, add items to a cart, and walk through a checkout flow, but nothing you do here creates a real sale or ships a real product.',
          'You agree not to misuse the site — for example by attempting to break, overload, or probe it for vulnerabilities outside of a good-faith review.',
        ],
      },
      {
        heading: 'Accounts',
        body: [
          'You can create a demo account to save a cart, addresses, and order history. Do not enter real passwords or sensitive personal details — treat every field as throwaway sample data.',
          'You are responsible for anything done under an account you create here.',
        ],
      },
      {
        heading: 'Orders, prices & payment',
        body: [
          'Prices, discounts, delivery dates, and stock are generated for demonstration and do not reflect real availability or value.',
          'Any card entry uses test payment details only. No money changes hands and no order is fulfilled.',
        ],
      },
      {
        heading: 'Intellectual property',
        body: [
          'The layout and code of this demo are the work of its author. Brand names, logos, and product images shown here belong to their respective owners and are used only to illustrate the clone.',
        ],
      },
      {
        heading: 'Disclaimer & changes',
        body: [
          'The site is provided “as is”, without warranties of any kind, and may change or go offline at any time.',
          'These conditions may be updated as the demo evolves; the “last updated” date above reflects the latest revision.',
        ],
      },
    ],
  },

  'privacy-notice': {
    title: 'Privacy Notice',
    updated: 'September 2026',
    intro:
      'This notice explains what limited data the demo handles as you use it. Because this is a practice storefront, it collects far less than a real store would.',
    sections: [
      {
        heading: 'What is stored',
        body: [
          'A cart, a demo sign-in state, saved addresses, and recent orders are kept so the flow feels realistic. These live in cookies on your device and, for some features, in your browser’s local storage.',
          'The site does not ask for, and you should never enter, real financial or identity information.',
        ],
      },
      {
        heading: 'How it is used',
        body: [
          'Stored data is used only to make the demo work — to remember your cart between pages, show an order confirmation, or greet you by the name you entered.',
        ],
      },
      {
        heading: 'Cookies & local storage',
        body: [
          'Essential cookies keep your cart and session working. Some interactive pieces (such as marking a review helpful) remember your choice locally in your own browser.',
          'You can clear this at any time by clearing the site’s cookies and local storage in your browser settings.',
        ],
      },
      {
        heading: 'Sharing',
        body: [
          'The demo does not sell your data or share it with advertisers. Any external links in the footer take you to third-party sites that have their own separate policies.',
        ],
      },
      {
        heading: 'Your choices',
        body: [
          'You can browse without signing in, remove items and addresses, and clear local data whenever you like. Since no real account exists, there is nothing further to delete on a server.',
        ],
      },
    ],
  },

  'interest-based-ads': {
    title: 'Interest-Based Ads',
    updated: 'September 2026',
    intro:
      'Interest-based ads are ads chosen based on what someone has browsed or bought. This section explains where the demo stands on that.',
    sections: [
      {
        heading: 'The short version',
        body: [
          'This demo does not run real advertising and does not build an advertising profile about you. Any “sponsored” or “deal” styling you see is part of the mock storefront, not a live ad system.',
        ],
      },
      {
        heading: 'How real interest-based ads work',
        body: [
          'On a live store, an ad system may use your activity to guess which products you might like and show related ads on the site or elsewhere.',
          'That involves tracking identifiers and, often, third-party ad partners — none of which are wired up here.',
        ],
      },
      {
        heading: 'Your controls',
        body: [
          'Because nothing is tracked for ads in this demo, there is nothing to opt out of. On a real store you would typically find an ads-preferences setting and browser-level controls to limit this.',
        ],
      },
    ],
  },

  'health-data-privacy': {
    title: 'Consumer Health Data Privacy Disclosure',
    updated: 'September 2026',
    intro:
      'Some regions require a specific disclosure about consumer health data. This page describes how the demo treats that category of information.',
    sections: [
      {
        heading: 'Scope',
        body: [
          '“Consumer health data” means information that could reveal something about a person’s physical or mental health. Certain laws give people extra rights over it.',
        ],
      },
      {
        heading: 'What the demo collects',
        body: [
          'This demo does not intentionally collect, infer, or store health data. It has no pharmacy, prescription, or medical features that are actually functional.',
          'You should not enter any real health information into the demo.',
        ],
      },
      {
        heading: 'If such data appears anyway',
        body: [
          'Any text you type into a demo field (for example a review) is stored only as described in the Privacy Notice — locally or in cookies — and is never sold or shared with third parties.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'On a real store you would be able to request access to, or deletion of, health data. Here, you can clear everything yourself by clearing the site’s cookies and local storage.',
        ],
      },
    ],
  },

  'ads-privacy-choices': {
    title: 'Your Ads Privacy Choices',
    updated: 'September 2026',
    intro:
      'This page is where a real store would let you control how your information is used for advertising. Here is what applies in the demo.',
    sections: [
      {
        heading: 'Your choice',
        body: [
          'This demo does not use your information for advertising and does not sell or “share” it in the advertising sense, so there is no ad targeting to turn off.',
        ],
      },
      {
        heading: 'On a real store',
        body: [
          'A live storefront would show a toggle here to opt out of personalised ads and the sale or sharing of personal information, and would honour browser signals such as Global Privacy Control.',
        ],
      },
      {
        heading: 'Managing local data',
        body: [
          'You remain in control of the small amount of data the demo keeps: clear the site’s cookies and local storage at any time to reset it completely.',
        ],
      },
    ],
  },
};

export const legalSlugs = Object.keys(LEGAL_PAGES);

export const getLegalPage = (slug: string): LegalPage | undefined => LEGAL_PAGES[slug];
