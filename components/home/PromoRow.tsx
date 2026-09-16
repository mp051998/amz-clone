import { PromoCard, type PromoTile } from './PromoCard';

/** Horizontally scrollable row of promotional tiles — the module that leads the
 *  amazon.in home page above the category cards. */
export function PromoRow({ tiles }: { tiles: PromoTile[] }) {
  return (
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/20">
        {tiles.map((t) => (<PromoCard key={t.headline + t.sub} tile={t} />))}
      </div>
    </div>
  );
}
