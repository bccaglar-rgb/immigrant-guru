interface Props {
  sourceName: string;
  label?: string;
}

export const SourceChip = ({ sourceName, label = "Source:" }: Props) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#17191d] px-3 py-1 text-xs text-white">
    <span className="h-1.5 w-1.5 rounded-full bg-[#F5C542]" />
    <span className="text-[#BFC2C7]">{label}</span>
    <span className="font-semibold">{sourceName}</span>
  </div>
);

