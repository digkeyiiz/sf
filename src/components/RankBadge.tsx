import React from 'react';
import { getRankForExp } from '../shared/progression';

interface RankBadgeProps {
  exp: number;
  size?: 'sm' | 'md' | 'lg';
  showTitle?: boolean;
}

/**
 * Authentic Special Force Military Rank Insignia Badge (inline SVG).
 * Renders chevrons (Enlisted), bars (NCO), diamonds (Sergeant Major),
 * gold pips (Company Officers), laurels (Field Officers), and stars (Generals).
 */
export const RankBadge: React.FC<RankBadgeProps> = ({ exp, size = 'sm', showTitle = false }) => {
  const { rank } = getRankForExp(exp);
  const px = size === 'lg' ? 32 : size === 'md' ? 24 : 18;

  const renderInsignia = () => {
    const c = rank.color;
    const n = rank.insigniaCount;

    if (rank.insigniaType === 'chevron') {
      return (
        <>
          {Array.from({ length: n }, (_, i) => {
            const y = 16 - i * 4.5;
            return (
              <path
                key={i}
                d={`M5 ${y + 3} L12 ${y - 2} L19 ${y + 3}`}
                fill="none"
                stroke={c}
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </>
      );
    }

    if (rank.insigniaType === 'bar') {
      return (
        <>
          {Array.from({ length: n }, (_, i) => {
            const y = 16 - i * 4.2;
            return (
              <rect
                key={i}
                x="5"
                y={y}
                width="14"
                height="2.5"
                rx="0.8"
                fill={c}
              />
            );
          })}
        </>
      );
    }

    if (rank.insigniaType === 'diamond') {
      return (
        <>
          <path
            d="M5 18 L12 14 L19 18"
            fill="none"
            stroke={c}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {Array.from({ length: n }, (_, i) => {
            const cx = n === 1 ? 12 : i === 0 ? 8.5 : 15.5;
            return (
              <polygon
                key={i}
                points={`${cx},5 ${cx + 3.2},9 ${cx},13 ${cx - 3.2},9`}
                fill={c}
              />
            );
          })}
        </>
      );
    }

    if (rank.insigniaType === 'pip') {
      const positions =
        n === 1
          ? [[12, 12]]
          : n === 2
            ? [
                [8.5, 12],
                [15.5, 12],
              ]
            : [
                [12, 7.5],
                [8, 15.5],
                [16, 15.5],
              ];
      return (
        <>
          {positions.map(([cx, cy], i) => (
            <polygon
              key={i}
              points={`${cx},${cy - 3.6} ${cx + 3.4},${cy} ${cx},${cy + 3.6} ${cx - 3.4},${cy}`}
              fill={c}
              stroke="#090C12"
              strokeWidth="0.6"
            />
          ))}
        </>
      );
    }

    if (rank.insigniaType === 'laurel') {
      const xs = n === 1 ? [12] : n === 2 ? [8.5, 15.5] : [6.8, 12, 17.2];
      return (
        <>
          <path
            d="M4.5 16.5 Q12 21.5 19.5 16.5"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {xs.map((cx, i) => (
            <circle key={i} cx={cx} cy="10.5" r="2.6" fill={c} />
          ))}
        </>
      );
    }

    // General Stars
    const starCenters =
      n === 1
        ? [[12, 12]]
        : [
            [12, 7],
            [7.5, 15.5],
            [16.5, 15.5],
          ];
    return (
      <>
        {starCenters.map(([cx, cy], i) => (
          <polygon
            key={i}
            points={`${cx},${cy - 4} ${cx + 1.2},${cy - 1.2} ${cx + 4},${cy - 1.2} ${cx + 1.8},${cy + 0.8} ${cx + 2.5},${cy + 3.8} ${cx},${cy + 2} ${cx - 2.5},${cy + 3.8} ${cx - 1.8},${cy + 0.8} ${cx - 4},${cy - 1.2} ${cx - 1.2},${cy - 1.2}`}
            fill={c}
          />
        ))}
      </>
    );
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 shrink-0"
      title={`${rank.thaiName} (${rank.enName})`}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        className="shrink-0"
        aria-label={rank.thaiName}
      >
        <rect
          x="1"
          y="1"
          width="22"
          height="22"
          rx="4"
          fill="#0d131f"
          stroke={rank.color}
          strokeOpacity="0.65"
          strokeWidth="1.4"
        />
        {renderInsignia()}
      </svg>
      {showTitle && (
        <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">
          {rank.thaiName}
        </span>
      )}
    </span>
  );
};
