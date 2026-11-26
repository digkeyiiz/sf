import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Coins,
  Glasses,
  HardHat,
  Lock,
  Palette,
  RotateCcw,
  Shield,
  Shirt,
  Sparkles,
} from 'lucide-react';
import {
  COSMETIC_ITEMS,
  getRankForExp,
  type CosmeticCategory,
  type CosmeticItem,
} from '../shared/progression';
import { PRIMARY_WEAPONS, WEAPONS } from '../shared/weapons';
import type { CharacterLoadout, PlayerProfile, PrimaryWeaponId } from '../shared/types';
import { CharacterPreview3D } from './CharacterPreview3D';
import { RankBadge } from './RankBadge';
import { soundEngine } from '../game/sound';

interface CharacterCustomizerProps {
  profile: PlayerProfile;
  primaryWeapon: PrimaryWeaponId;
  onChangePrimaryWeapon: (w: PrimaryWeaponId) => void;
  onEquipLoadout: (nextLoadout: CharacterLoadout) => Promise<void>;
  onPurchaseItem: (itemId: string) => Promise<string | null>;
}

const CATEGORIES: Array<{
  id: CosmeticCategory;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'uniform', label: 'ชุด', icon: Shirt },
  { id: 'headgear', label: 'หมวก', icon: HardHat },
  { id: 'facegear', label: 'หน้ากาก', icon: Glasses },
  { id: 'vest', label: 'เกราะ', icon: Shield },
  { id: 'weaponSkin', label: 'ลายปืน', icon: Palette },
];

export const CharacterCustomizer: React.FC<CharacterCustomizerProps> = ({
  profile,
  primaryWeapon,
  onChangePrimaryWeapon,
  onEquipLoadout,
  onPurchaseItem,
}) => {
  const [activeCategory, setActiveCategory] = useState<CosmeticCategory>('uniform');
  const [previewLoadout, setPreviewLoadout] = useState<CharacterLoadout>(profile.loadout);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shopMsg, setShopMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const ownedSet = new Set(profile.ownedItems);
  const rankInfo = getRankForExp(profile.exp);
  const itemsInCat = COSMETIC_ITEMS.filter((i) => i.category === activeCategory);

  const getEquippedIdForCat = (loadout: CharacterLoadout, cat: CosmeticCategory): string => {
    if (cat === 'uniform') return loadout.uniformId;
    if (cat === 'headgear') return loadout.headgearId;
    if (cat === 'facegear') return loadout.facegearId;
    if (cat === 'vest') return loadout.vestId;
    return loadout.weaponSkinId;
  };

  const applyCategoryValue = (
    base: CharacterLoadout,
    cat: CosmeticCategory,
    itemId: string
  ): CharacterLoadout => {
    if (cat === 'uniform') return { ...base, uniformId: itemId };
    if (cat === 'headgear') return { ...base, headgearId: itemId };
    if (cat === 'facegear') return { ...base, facegearId: itemId };
    if (cat === 'vest') return { ...base, vestId: itemId };
    return { ...base, weaponSkinId: itemId };
  };

  const isPreviewingUnowned =
    !ownedSet.has(previewLoadout.uniformId) ||
    !ownedSet.has(previewLoadout.headgearId) ||
    !ownedSet.has(previewLoadout.facegearId) ||
    !ownedSet.has(previewLoadout.vestId) ||
    !ownedSet.has(previewLoadout.weaponSkinId);

  const handleSelectCard = async (item: CosmeticItem) => {
    soundEngine.playUiClick();
    setShopMsg(null);
    const nextPreview = applyCategoryValue(previewLoadout, item.category, item.id);
    setPreviewLoadout(nextPreview);

    if (ownedSet.has(item.id)) {
      const nextReal = applyCategoryValue(profile.loadout, item.category, item.id);
      await onEquipLoadout(nextReal);
      setShopMsg({ type: 'ok', text: `สวมใส่ "${item.thaiName}" แล้ว` });
    }
  };

  const handleBuy = async (item: CosmeticItem) => {
    soundEngine.playUiClick();
    setBusyId(item.id);
    setShopMsg(null);
    const err = await onPurchaseItem(item.id);
    setBusyId(null);
    if (err) {
      setShopMsg({ type: 'err', text: err });
    } else {
      setPreviewLoadout((prev) => applyCategoryValue(prev, item.category, item.id));
      setShopMsg({ type: 'ok', text: `ซื้อและสวมใส่ "${item.thaiName}" แล้ว!` });
    }
  };

  const handleResetPreview = () => {
    soundEngine.playUiClick();
    setPreviewLoadout(profile.loadout);
    setShopMsg(null);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-5 h-full items-stretch">
      {/* Left 5 Columns: Live 360° 3D Operator Studio (Side-by-side even on mobile landscape!) */}
      <div className="sm:col-span-5 flex flex-col gap-2.5 min-h-0">
        <div className="bg-[#111623] border border-white/10 rounded-lg p-2.5 sm:p-3.5 flex flex-col gap-2.5 flex-1 min-h-0">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <RankBadge exp={profile.exp} size="sm" />
              <div className="min-w-0">
                <div className="font-display font-bold text-white text-xs sm:text-sm truncate">
                  {profile.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {rankInfo.rank.thaiName}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isPreviewingUnowned && (
                <button
                  type="button"
                  onClick={handleResetPreview}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
                  title="กลับสู่ชุดที่ใส่อยู่"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>รีเซ็ต</span>
                </button>
              )}
              <div className="inline-flex items-center gap-1 font-mono-num text-xs sm:text-sm font-bold text-amber-400">
                <Coins className="w-3.5 h-3.5" />
                <span>{profile.sp.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-[210px] sm:min-h-[260px]">
            <CharacterPreview3D
              loadout={previewLoadout}
              weaponId={primaryWeapon}
              team="blue"
              name={profile.name}
              rankShort={rankInfo.rank.shortCode}
            />
          </div>

          {/* Compact Primary Weapon Strip for Live Skin Preview */}
          <div className="grid grid-cols-4 gap-1 shrink-0">
            {PRIMARY_WEAPONS.map((wId) => (
              <button
                key={wId}
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  onChangePrimaryWeapon(wId);
                }}
                className={`py-1 px-1 text-[10px] font-mono-num font-bold rounded border transition-colors truncate cursor-pointer ${
                  primaryWeapon === wId
                    ? 'bg-amber-400 text-[#090C12] border-amber-400'
                    : 'bg-[#090C12] text-slate-300 border-white/10 hover:border-white/25'
                }`}
              >
                {WEAPONS[wId].name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right 7 Columns: Icon-First Category Tabs & Scrollable Wardrobe Grid */}
      <div className="sm:col-span-7 flex flex-col gap-2.5 min-h-0">
        {/* Compact Icon Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setActiveCategory(cat.id);
                }}
                className={`px-3 py-1.5 sm:py-2 text-xs font-display font-bold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-amber-400 text-[#090C12] border-amber-400'
                    : 'bg-[#111623] text-slate-300 border-white/10 hover:border-white/25'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {shopMsg && (
          <div
            className={`px-3 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1.5 shrink-0 ${
              shopMsg.type === 'ok'
                ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                : 'bg-red-500/12 border-red-500/35 text-red-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{shopMsg.text}</span>
          </div>
        )}

        {/* Scrollable Item Grid */}
        <div className="flex-1 overflow-y-auto pr-0.5 grid grid-cols-1 md:grid-cols-2 gap-2.5 content-start">
          {itemsInCat.map((item) => {
            const owned = ownedSet.has(item.id);
            const equipped = getEquippedIdForCat(profile.loadout, item.category) === item.id;
            const previewed = getEquippedIdForCat(previewLoadout, item.category) === item.id;
            const canAfford = profile.sp >= item.priceSp;

            return (
              <motion.div
                key={item.id}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleSelectCard(item)}
                className={`p-3 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
                  equipped
                    ? 'bg-amber-500/12 border-amber-400'
                    : previewed
                      ? 'bg-sky-500/10 border-sky-400/70'
                      : 'bg-[#111623] border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-8 h-8 rounded-md border border-white/20 shrink-0 relative overflow-hidden"
                      style={{ backgroundColor: item.swatch }}
                    >
                      {item.accent && (
                        <span
                          className="absolute bottom-0 inset-x-0 h-2"
                          style={{ backgroundColor: item.accent }}
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-xs sm:text-sm text-white truncate">
                        {item.thaiName}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{item.name}</div>
                    </div>
                  </div>

                  {equipped ? (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-400 shrink-0">
                      <Check className="w-3.5 h-3.5" />
                      ใส่อยู่
                    </span>
                  ) : owned ? (
                    <span className="text-[11px] font-semibold text-emerald-400 shrink-0">
                      มีแล้ว
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono-num text-[11px] font-bold text-amber-300 shrink-0">
                      <Lock className="w-3 h-3" />
                      {item.priceSp}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/8">
                  <span className="text-[10px] text-slate-400 truncate">
                    {item.description}
                  </span>

                  {!owned && (
                    <button
                      type="button"
                      disabled={busyId === item.id || !canAfford}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBuy(item);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-display font-bold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        canAfford
                          ? 'bg-amber-400 hover:bg-amber-300 text-[#090C12]'
                          : 'bg-white/8 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {busyId === item.id
                        ? '...'
                        : canAfford
                          ? `ซื้อ ${item.priceSp}`
                          : 'SP ไม่พอ'}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
