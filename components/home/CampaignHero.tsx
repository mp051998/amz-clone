import type { HomeCampaign } from '@/lib/contracts';

export function CampaignHero({ campaign }: { campaign: HomeCampaign }) {
  return (
    <section className="campaign-hero" aria-label={campaign.title}>
      <a className="campaign-hero__link" href={campaign.href}>
        <img className="campaign-hero__image" src={campaign.image} alt={campaign.alt} />
        <span className="campaign-hero__copy">
          <span className="campaign-hero__title">{campaign.title}</span>
          {campaign.cta ? <span className="campaign-hero__cta">{campaign.cta}</span> : null}
        </span>
      </a>
    </section>
  );
}
