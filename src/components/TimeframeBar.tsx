import type { Timeframe } from "../types";

interface Props {
  value: Timeframe;
  onChange: (timeframe: Timeframe) => void;
}

const options: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

export const TimeframeBar = ({ value, onChange }: Props) => (
  <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-[#0F1012] p-1">
    {options.map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
          value === option
            ? "bg-[#2b2417] text-[#F5C542]"
            : "text-[#BFC2C7] hover:bg-[#17191d]"
        }`}
      >
        {option}
      </button>
    ))}
  </div>
);
